/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import Joi from 'joi';
import { InternalCoreSetup } from 'src/core/server';
import { withDefaultQueryParamValidators } from '../lib/helpers/input_validation';
import { setupRequest } from '../lib/helpers/setup_request';
import { getMetricsChartDataByAgent } from '../lib/metrics/get_metrics_chart_data_by_agent';

export function initMetricsApi(core: InternalCoreSetup) {
  const { server } = core.http;

  server.route({
    method: 'GET',
    path: `/api/apm/services/{serviceName}/metrics/charts`,
    options: {
      validate: {
        query: withDefaultQueryParamValidators({
          agentName: Joi.string().required()
        })
      },
      tags: ['access:apm']
    },
    handler: async req => {
      const setup = await setupRequest(req);
      const { serviceName } = req.params;
      // casting approach recommended here: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/25605
      const { agentName } = req.query as { agentName: string };
      return await getMetricsChartDataByAgent({
        setup,
        serviceName,
        agentName
      });
    }
  });
}
