import * as express from 'express';
import * as crypto from 'crypto';
import * as bl from 'bl';
import * as bufferEq from 'buffer-equal-constant-time';
import * as request from 'request-promise-native';
import * as bunyan from 'bunyan';

import * as common from '../../common';

const logger = bunyan.createLogger({ name: 'github-scm' });
const ROOT_URL = 'https://api.github.com';

export class GitHubScm implements common.Scm {

    constructor(private repoCredentials: common.RepoCredentials) {
    }

    public async addCommitStatus(repoUrl: string, repoName: string, commit: string, status: common.CommitStatus) {
        try {
            const creds = this.getCredsByRepoUrl(repoUrl);
            await request.post(`${ROOT_URL}/repos/${repoName}/commits/${commit}/statuses`, {
                body: JSON.stringify({
                    state: status.state,
                    target_url: status.targetUrl,
                    description: status.description,
                }),
                headers: { 'User-Agent': 'Argo CI' },
                auth: { username: creds.username, password: creds.password },
            });
        } catch (e) {
            logger.error('Failed to post status update', e);
        }
    }

    public parseEvent(req: express.Request): Promise<common.ScmEvent> {
        const sig = req.headers['x-hub-signature'];
        const event = req.headers['x-github-event'].toString();
        const id = req.headers['x-github-delivery'];

        if (!sig) {
            throw new Error('No X-Hub-Signature found on request');
        }

        if (!event) {
            throw new Error('No X-Github-Event found on request');
        }

        if (!id) {
            throw new Error('No X-Github-Delivery found on request');
        }

        return new Promise((resolve, reject) => {
            req.pipe(bl((err, data) => {
                if (err) {
                    reject(err.message);
                }

                try {
                    const obj = JSON.parse(data.toString());
                    const scmEvent = this.convertWebHookEvent(event, obj);
                    const creds = this.getCredsByRepoUrl(scmEvent.repository.cloneUrl);
                    if (creds.secret && !this.verify(sig, data, creds.secret)) {
                        reject('X-Hub-Signature does not match blob signature');
                    }
                    resolve(scmEvent);
                } catch (e) {
                    return reject(e);
                }
            }));
        });
    }

    private convertWebHookEvent(eventType: string, eventData): common.ScmEvent {
        if (eventType === 'push') {
            return {
                type: 'push',
                repository: { cloneUrl: eventData.repository.clone_url, fullName: eventData.repository.full_name },
                headCommitSha: eventData.head_commit.id,
            };
        } else if (eventType === 'pull_request') {
            return {
                type: 'pull_request',
                repository: { cloneUrl: eventData.repository.clone_url, fullName: eventData.repository.full_name },
                headCommitSha: eventData.pull_request.head.sha,
            };
        } else {
            return null;
        }
    }

    private verify(signature, data, secret: string) {
        return bufferEq(Buffer.from(signature), Buffer.from(this.sign(data, secret)));
    }

    private sign(data, secret: string) {
        return 'sha1=' + crypto.createHmac('sha1', secret).update(data).digest('hex');
    }

    private getCredsByRepoUrl(url: string): common.Credentials {
        const creds = this.repoCredentials[url];
        if (!creds) {
            throw {
                responseCode: 400,
                message: `Repository '${url}' is not configured`,
            };
        }
        return creds;
    }
}