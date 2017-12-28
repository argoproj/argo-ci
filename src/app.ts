import * as express from 'express';
import * as bunyan from 'bunyan';
import * as bodyParser from 'body-parser';

import * as common from './common';
import * as util from './util';
import { CiProcessor } from './ci-processor';
import { ScmManager } from './scm';

const logger = bunyan.createLogger({ name: 'app' });

function wrap(action: (req: express.Request) => Promise<any>) {
    return (req: express.Request, res: express.Response) => {
        action(req)
            .then(data => {
                res.send(data);
            })
            .catch(e => {
                res.statusCode = e.statusCode || 500;
                res.send({
                    message: e.message || e,
                });
                if (res.statusCode === 500) {
                    logger.error('Failed to process request %s', req.url, e);
                }
            });
    };
}

export async function createServer(
    options: {
        argoUiUrl: string,
        repoDir: string,
        inCluster: boolean,
        namespace: string,
        version: string,
        argoCiImage: string,
        configPrefix: string,
    }) {

    const crdKubeClient = util.createKubeCrdClient(options.inCluster, options.namespace, 'argoproj.io', options.version);
    const coreKubeClient = util.createKubeCoreClient(options.inCluster, options.namespace);
    const scmManager = await ScmManager.create(options.configPrefix, coreKubeClient);
    const processor = new CiProcessor(options.repoDir, options.argoUiUrl, crdKubeClient, options.argoCiImage, options.configPrefix);

    const app = express();

    app.post('/api/webhook/:type', wrap(async req => {
        const scmByType = await scmManager.getScms();
        const scm = scmByType.get(req.params.type);
        if (scm) {
            const event = await scm.parseEvent(req);
            if (event) {
                processor.processGitEvent(scm, event);
            }
            return {ok: true };
        } else {
            throw { statusCode: 404, message: `Webhook for '${req.params.type}' is not supported` };
        }
    }));
    app.get('/api/scms', wrap(async req => {
        const res = {};
        const config = scmManager.getScmsConfig();
        Array.from(config.keys()).forEach(type => res[type] = config.get(type));
        return res;
    }));

    app.use(bodyParser.json({type: (req) => !req.url.startsWith('/api/webhook/')}));
    app.post('/api/scms/:type', wrap(async req => {
        await scmManager.setScm(<common.ScmType> req.params.type, req.body.username, req.body.password, req.body.secret, req.body.repoUrl);
        return {ok: true };
    }));

    return app;
}
