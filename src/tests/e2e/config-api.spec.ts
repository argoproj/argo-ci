import { apiAgent } from './helper';
import { expect } from 'chai';

describe('Config API', () => {

    it('returns default settings', async () => {
        const res = await apiAgent.get('/api/configuration/settings');
        expect(res.body.externalUiUrl).to.be.eq('http://argo-ci');
    });

    it('updates settings and saves updated values in config map', async () => {
        await apiAgent.put('/api/configuration/settings').send({ externalUiUrl: 'http://argo-ci.updated' });

        const res = await apiAgent.get('/api/configuration/settings');
        expect(res.body.externalUiUrl).to.be.eq('http://argo-ci.updated');
    });
});
