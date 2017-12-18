import * as http from 'http';
import * as bunyan from 'bunyan';

import * as common from './common';
import * as util from './util';
import { CiProcessor } from './ci-processor';

const logger = bunyan.createLogger({ name: 'app' });

export function createServer(
    scmByType: { [name: string]: common.Scm },
    options: {
        argoUiUrl: string,
        repoDir: string,
        inCluster: boolean,
        namespace: string,
        version: string,
    }) {

    const crdKubeClient = util.createKubeCrdClient(options.inCluster, options.namespace, 'argoproj.io', options.version);
    const processor = new CiProcessor(options.repoDir, options.argoUiUrl, crdKubeClient);

    const server = http.createServer(async (req, res) => {
        try {
            const parts = req.url.split('/');
            const type = parts[parts.length - 1];
            const scm = scmByType[type];
            if (scm) {
                const event = await scm.parseEvent(req);
                if (event) {
                    processor.processGitEvent(scm, event);
                }
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end('{"ok":true}');
            } else {
                res.statusCode = 404;
                res.end('no such location');
            }
        } catch (e) {
            logger.error('Failed to process request %s', req.url, e);
            res.statusCode = 500;
            res.end(e.message);
        }
    });

    return server;
}
