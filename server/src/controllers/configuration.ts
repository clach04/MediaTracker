import _ from 'lodash';
import { createExpressRoute } from 'typescript-routes-to-openapi-server';

import { onlyForAdmin } from 'src/auth';
import { Configuration } from 'src/entity/configuration';
import { configurationRepository } from 'src/repository/globalSettings';
import { userRepository } from 'src/repository/user';
import { DEMO } from 'src/config';

/**
 * @openapi_tags Configuration
 */
export class ConfigurationController {
    /**
     * @openapi_operationId update
     */
    update = createExpressRoute<{
        path: '/api/configuration';
        method: 'patch';
        requestBody: Partial<Omit<Configuration, 'id'>>;
    }>(onlyForAdmin, async (req, res) => {
        await configurationRepository.update(req.body);

        res.send();
    });

    /**
     * @openapi_operationId get
     */
    get = createExpressRoute<{
        path: '/api/configuration';
        method: 'get';
        responseBody: Omit<Configuration, 'id'> & {
            noUsers: boolean;
            demo: boolean;
        };
    }>(async (req, res) => {
        const configuration = await configurationRepository.findOne();
        const numberOfUsers = await userRepository.count();
        
        res.send({
            ..._.omit(configuration, 'id'),
            noUsers: numberOfUsers === 0,
            demo: DEMO,
        });
    });
}
