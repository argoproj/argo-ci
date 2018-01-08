import { Observable, Observer, BehaviorSubject, Subscription } from 'rxjs';
import * as JSONStream from 'json-stream';

import * as common from './common';
import * as scm from './scm';

type ScmsConfig = Map<common.ScmType, common.RepoCredentials>;

export class ConfigManager {

    public static async create(kubeSecretPrefix: string, kubeCoreClient): Promise<ConfigManager> {
        const manager = new ConfigManager(kubeSecretPrefix, kubeCoreClient);
        await manager.initialize();
        return manager;
    }

    private subscription: Subscription;
    private scmsConfig: BehaviorSubject<ScmsConfig>;

    private constructor(public readonly kubeSecretPrefix: string, private kubeCoreClient) {}

    public async getScms(): Promise<Map<common.ScmType, common.Scm>> {
        return this.getScmsFromConfig(this.scmsConfig.getValue());
    }

    public async getSettings(): Promise<common.Settings> {
        const configMap = await this.loadKubeEntity('configmap', this.configMapName) || {
            data: {
                externalUiUrl: 'http://argo-ci',
            },
        };
        return configMap.data;
    }

    public async updateSettings(settings: common.Settings) {
        const updatedConfigMap = {
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: {
                name: this.configMapName,
            },
            data: settings,
        };
        await this.updateKubeEntity('configmap', this.configMapName, updatedConfigMap);
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

    public async removeScm(type: common.ScmType, repoUrl: string) {
        const scmsConfig = this.scmsConfig.getValue();
        const config: common.RepoCredentials = scmsConfig.get(type) || {};
        delete config[repoUrl];
        scmsConfig.set(type, config);
        if (Object.keys(config).length === 0) {
            scmsConfig.delete(type);
        }
        await this.updateScmSecret(scmsConfig);
    }

    public dispose() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
    }

    private async initialize() {
        this.scmsConfig = new BehaviorSubject<ScmsConfig>(this.deserializeScmsConfig((await this.loadKubeEntity('secret', this.secretName) || {}).data));
        this.subscription = new Observable((observer: Observer<any>) => {
            let stream = this.kubeCoreClient.ns.secret.getStream({ qs: { watch: true } });
            stream.on('end', () => observer.complete());
            stream.on('error', e => observer.error(e));
            stream.on('close', () => observer.complete());
            const jsonStream = stream.pipe(new JSONStream());
            jsonStream.on('data', (d) => observer.next(d));
            return () => stream.req.abort();
        })
        .repeat().retry()
        .filter(info => info.object && info.object.metadata && info.object.metadata.name === this.secretName)
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
        const updatedSecret = {
            apiVersion: 'v1',
            kind: 'Secret',
            metadata: {
                name: this.secretName,
            },
            type: 'Opaque',
            data: this.serializeScmsConfig(data),
        };
        this.updateKubeEntity('secret', this.secretName, updatedSecret);
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

    private async updateKubeEntity(type: string, name: string, updatedEntity) {
        const entity = await this.loadKubeEntity(type, name);
        if (!entity)  {
            await this.kubeCoreClient.ns[type].post({ body: updatedEntity });
        } else {
            await this.kubeCoreClient.ns[type].put({ name, body: updatedEntity });
        }
    }

    private async loadKubeEntity(type: string, name: string) {
        try  {
            return await this.kubeCoreClient.ns[type].get(name);
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

    private get configMapName(): string {
        return `${this.kubeSecretPrefix}-settings`;
    }
}
