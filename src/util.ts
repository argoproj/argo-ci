import * as shell from 'shelljs';
import * as shellEscape from 'shell-escape';
import * as promisify from 'promisify-node';
import * as Api from 'kubernetes-client';
const fs = promisify('fs');

export function sh(cmd: string, cwd: string = null, rejectOnFail = true): Promise<{code, stdout, stderr}> {
    return new Promise((resolve, reject) => {
        shell.exec(shellEscape(['sh', '-c', cmd]), { silent: true, cwd } , (code, stdout, stderr) => {
            let res = { code, stdout, stderr };
            if (code !== 0 && rejectOnFail) {
                reject(res);
            } else {
                resolve(res);
            }
        });
    });
}

export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.stat(filePath);
        return true;
    } catch {
        return false;
    }
}

export function createKubeCrdClient(inCluster: boolean, namespace: string, group: string, version: string): Api.CustomResourceDefinitions {
    const config = {
        ...(inCluster ? Api.config.getInCluster() : Api.config.fromKubeconfig()), namespace, group, promises: true,
    };
    const client = new Api.CustomResourceDefinitions({...config, version, group});
    client.addResource('workflows');
    return client;
}

