import * as http from 'http';
import * as crypto from 'crypto';
import * as bl from 'bl';
import * as bufferEq from 'buffer-equal-constant-time';
import * as request from 'request-promise-native';
import * as bunyan from 'bunyan';

import * as common from '../common';

const logger = bunyan.createLogger({ name: 'github-scm' });
const ROOT_URL = 'https://api.github.com';

export class GitHubScm implements common.Scm {

    constructor(private secret: string, private username: string, private password: string) {
    }

    public async addCommitStatus(event: common.ScmEvent, status: common.CommitStatus) {
        try {
        await request
            .post(`${ROOT_URL}/repos/${event.repository.fullName}/commits/${event.headCommitSha}/statuses`, {
                body: JSON.stringify({
                    state: status.state,
                    target_url: status.targetUrl,
                    description: status.description,
                }),
                headers: { 'User-Agent': 'Argo CI' },
                auth: { username: this.username, password: this.password },
            });
        } catch (e) {
            logger.error('Failed to post status update', e);
        }
    }

    public parseEvent(req: http.IncomingMessage): Promise<common.ScmEvent> {
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

                if (!this.verify(sig, data)) {
                    reject('X-Hub-Signature does not match blob signature');
                }

                try {
                    const obj = JSON.parse(data.toString());
                    resolve(this.convertWebHookEvent(event, obj));
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

    private verify(signature, data) {
        return bufferEq(Buffer.from(signature), Buffer.from(this.sign(data)));
    }

    private sign(data) {
        return 'sha1=' + crypto.createHmac('sha1', this.secret).update(data).digest('hex');
    }
}
