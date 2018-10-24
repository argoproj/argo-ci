import * as promisify from 'promisify-node';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as AsyncLock from 'async-lock';
import * as Api from 'kubernetes-client';
import * as bunyan from 'bunyan';
import * as uuid from 'uuid';

import * as common from './common';
import * as util from './util';
import { ConfigManager } from './config-manager';

const fs = promisify('fs');
const logger = bunyan.createLogger({ name: 'ci-processor' });

export class CiProcessor {
    private lock = new AsyncLock();

    constructor(
        private reposPath: string,
        private crdKubeClient: Api.CustomResourceDefinitions,
        private argoCiImage: string,
        private namespace: string,
        private controllerInstanceId: string,
        private configManager: ConfigManager) {
    }

    public async processGitEvent(scm: common.Scm, scmEvent: common.ScmEvent) {
        try {
            logger.debug('Processing scm event', scmEvent);
            await this.doProcessGitEvent(scm, scmEvent);
        } catch (e) {
            logger.error(`Failed to process scm event '%s'`, JSON.stringify(scmEvent), e);
            this.addCommitStatus(scm, scmEvent, {targetUrl: null, description: 'Argo CI workflow', state: 'failure'});
        }
    }

    public async doProcessGitEvent(scm: common.Scm, scmEvent: common.ScmEvent) {
        const ciWorkflow = await this.asyncLock(scmEvent.commit.repo.cloneUrl, () => this.loadCiWorkflow(scmEvent.commit.repo.cloneUrl, scmEvent.commit.sha));
        if (ciWorkflow) {
            this.fillLabels(ciWorkflow);
            this.fillCommitArgs(scmEvent, ciWorkflow);
            await this.addExitHandler(scm, scmEvent, ciWorkflow);
            const res = await this.crdKubeClient.ns['workflows'].post({ body: ciWorkflow });
            this.addCommitStatus(scm, scmEvent, {
                targetUrl: await this.getStatusTargetUrl(res),
                description: 'Argo CI workflow',
                state: 'pending',
            });
        }
    }

    private async getStatusTargetUrl(workflow): Promise<string> {
        const settings = await this.configManager.getSettings();
        return `${settings.externalUiUrl}/workflows/${workflow.metadata.namespace}/${workflow.metadata.name}`;
    }

    private async addExitHandler(scm: common.Scm, scmEvent: common.ScmEvent, workflow) {
        const settings = await this.configManager.getSettings();
        const statusExitTemplate = {
            name: uuid(),
            container: {
                image: this.argoCiImage,
                command: ['sh', '-c'],
                args: ['node /app/scm/add-status.js ' +
                    `--status {{workflow.status}} --repoName ${scmEvent.repo.fullName} --repoUrl ${scmEvent.repo.cloneUrl} ` +
                    `--commit ${scmEvent.commit.sha} --targetUrl ${settings.externalUiUrl}/workflows/${this.namespace}/{{workflow.name}} ` +
                    `--inCluster true --configPrefix ${this.configManager.kubeSecretPrefix} ` +
                    `--scm ${scm.type} --namespace ${this.namespace}`],
            },
        };

        const existingExitHandler = workflow.spec.onExit;
        const steps = [{ name: statusExitTemplate.name, template: statusExitTemplate.name }];
        if (existingExitHandler) {
            steps.push(existingExitHandler);
        }
        const onExitTemplate = {
            name: uuid(),
            steps: [ steps ],
        };
        workflow.spec.onExit = onExitTemplate.name;
        workflow.spec.templates.push(statusExitTemplate);
        workflow.spec.templates.push(onExitTemplate);
    }

    private fillLabels(ciWorkflow) {
        if (this.controllerInstanceId) {
            const labels = ciWorkflow.metadata.labels || {};
            labels['workflows.argoproj.io/controller-instanceid'] = this.controllerInstanceId;
            ciWorkflow.metadata.labels = labels;
        }
    }

    private fillCommitArgs(scmEvent: common.ScmEvent, ciWorkflow) {
        if (ciWorkflow.spec.arguments && ciWorkflow.spec.arguments.parameters) {
            const revisionParam = ciWorkflow.spec.arguments.parameters.find(param => param.name === 'revision');
            const repoParam = ciWorkflow.spec.arguments.parameters.find(param => param.name === 'repo');
            if (revisionParam) {
                revisionParam.value = scmEvent.commit.sha;
            }
            if (repoParam) {
                repoParam.value = scmEvent.commit.repo.cloneUrl;
            }
        }
    }

    private async addCommitStatus(scm: common.Scm, event: common.ScmEvent, status: common.CommitStatus) {
        try {
            await scm.addCommitStatus(event.repo.cloneUrl, event.repo.fullName, event.commit.sha, status);
        } catch (e) {
            logger.error('Unable to update commit status', e);
        }
    }

    private asyncLock<T>(key: string, action: () => Promise<T>): Promise<T> {
        return this.lock.acquire(key, () => action());
    }

    private async ensureRepoInitialized(url: string) {
        const repoPath = path.join(this.reposPath, url.replace(/\//g, '_'));
        if (!await util.fileExists(repoPath)) {
            await fs.mkdir(repoPath);
        }
        try {
            await util.sh(`git status`, repoPath);
        } catch (e) {
            await util.sh(`git init && git config core.sparseCheckout true && echo '.argo-ci/' > .git/info/sparse-checkout && git remote add origin '${url}'`, repoPath);
        }
        logger.debug(`Updating repository '${url}'`);
        await util.sh('git fetch origin', repoPath);
        return repoPath;
    }

    private async loadCiWorkflow(repoCloneUrl: string, tag: string): Promise<any> {
        const repoPath = await this.ensureRepoInitialized(repoCloneUrl);
        try {
            await util.sh(`git checkout ${tag}`, repoPath);
        } catch (e) {
            //  Sparse checkout failes if .argo-ci/ does not exist
            logger.warn(`Repository '${repoCloneUrl}#${tag}' does not have .argo-ci/`);
        }
        const templatePath = `${repoPath}/.argo-ci/ci.yaml`;
        if (await util.fileExists(templatePath)) {
            return yaml.safeLoad(await fs.readFile(templatePath, 'utf8'));
        }
        logger.warn(`Repository '${repoCloneUrl}#${tag}' does not have .argo-ci/ci.yaml`);
        return null;
    }
}
