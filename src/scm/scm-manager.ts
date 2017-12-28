import { Observable, Observer, BehaviorSubject, Subscription } from 'rxjs';
import * as JSONStream from 'json-stream';

import * as common from '../common';
import * as scm from '../scm';

type ScmsConfig = Map<common.ScmType, common.RepoCredentials>;

export class ScmManager {

    public static async create(kubeSecretPrefix: string, kubeCoreClient): Promise<ScmManager> {
        const manager = new ScmManager(kubeSecretPrefix, kubeCoreClient);
        await manager.initialize();
        return manager;
    }

    private subscription: Subscription;
    private scmsConfig: BehaviorSubject<ScmsConfig>;

    private constructor(private kubeSecretPrefix: string, private kubeCoreClient) {}

    public async getScms(): Promise<Map<common.ScmType, common.Scm>> {
        return this.getScmsFromConfig(this.scmsConfig.getValue());
    }

    public getScmsConfig(): Map<common.ScmType, string[]> {
        let result = new Map<common.ScmType, string[]>();
        for (const key of this.scmsConfig.getValue().keys()) {
            const typeConfig = this.scmsConfig.getValue().get(key);
            result.set(key, Object.keys(typeConfig));
        }
        return result;
    }

    public async setScm(type: common.ScmType, username: string, password: string, secret: string, repoUrl: string): Promise<common.Scm> {
        const scmsConfig = this.scmsConfig.getValue();
        const config: common.RepoCredentials = scmsConfig.get(type) || {};
        config[repoUrl] = { username, password, secret };
        scmsConfig.set(type, config);
        await this.updateScmSecret(scmsConfig);
        const scms = await this.getScms();
        return scms.get(type);
    }

    public dispose() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
    }

    private async initialize() {
        this.scmsConfig = new BehaviorSubject<ScmsConfig>(this.deserializeScmsConfig((await this.loadScmSecret() || {}).data));
        this.subscription = new Observable((observer: Observer<any>) => {
            let stream = this.kubeCoreClient.ns.secret.getStream({ qs: { watch: true } });
            stream.on('end', () => observer.complete());
            stream.on('error', e => observer.error(e));
            stream.on('close', () => observer.complete());
            stream = stream.pipe(new JSONStream());
            stream.on('data', (d) => observer.next(d));
        })
        .repeat().retry()
        .filter(info => info.object.metadata.name === this.secretName)
        .subscribe(info => this.scmsConfig.next(this.deserializeScmsConfig(info.object.data)));
    }

    private getScmsFromConfig(scmsConfig: ScmsConfig) {
        const result = new Map<common.ScmType, common.Scm>();
        for (const key of scmsConfig.keys()) {
            let item: common.Scm;
            if (key === 'github') {
                item = new scm.GitHubScm(scmsConfig.get(key));
            } else {
                throw new Error(`Scm type ${key} is not supported`);
            }
            result.set(key, item);
        }
        return result;
    }

    private async updateScmSecret(data: ScmsConfig) {
        const secret = await this.loadScmSecret();
        const updatedSecret = { body: {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {
                name: this.secretName,
            },
            type: 'Opaque',
            data: this.serializeScmsConfig(data),
        }};
        if (!secret)  {
            await this.kubeCoreClient.ns.secret.post(updatedSecret);
        } else {
            await this.kubeCoreClient.ns.secret.put({ name: this.secretName, body: updatedSecret.body });
        }
    }

    private deserializeScmsConfig(data): ScmsConfig {
        const result = new Map<common.ScmType, common.RepoCredentials>();
        Object.keys(data || {}).forEach(key => {
            result.set(<common.ScmType> key, JSON.parse(new Buffer(data[key], 'base64').toString('ascii')));
        });
        return <ScmsConfig> result;
    }

    private serializeScmsConfig(config: ScmsConfig) {
        const result = {};
        for (const key of config.keys()) {
            result[key] = new Buffer(JSON.stringify(config.get(key))).toString('base64');
        }
        return result;
    }

    private async loadScmSecret() {
        try  {
            return await this.kubeCoreClient.ns.secret.get(this.secretName);
        } catch (e) {
            if (e.code === 404) {
                return null;
            } else {
                throw e;
            }
        }
    }

    private get secretName(): string {
        return `${this.kubeSecretPrefix}-scm`;
    }
}
