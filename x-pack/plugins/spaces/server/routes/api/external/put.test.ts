/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import * as Rx from 'rxjs';
import {
  createSpaces,
  createLegacyAPI,
  createMockSavedObjectsRepository,
  mockRouteContext,
  mockRouteContextWithInvalidLicense,
} from '../__fixtures__';
import { CoreSetup, IRouter, kibanaResponseFactory } from 'src/core/server';
import {
  loggingServiceMock,
  elasticsearchServiceMock,
  httpServiceMock,
  httpServerMock,
} from 'src/core/server/mocks';
import { SpacesService } from '../../../spaces_service';
import { SpacesAuditLogger } from '../../../lib/audit_logger';
import { SpacesClient } from '../../../lib/spaces_client';
import { initPutSpacesApi } from './put';
import { RouteSchemas } from 'src/core/server/http/router/route';
import { ObjectType } from '@kbn/config-schema';
import { spacesConfig } from '../../../lib/__fixtures__';
import { securityMock } from '../../../../../security/server/mocks';

describe('PUT /api/spaces/space', () => {
  const spacesSavedObjects = createSpaces();
  const spaces = spacesSavedObjects.map(s => ({ id: s.id, ...s.attributes }));

  const setup = async () => {
    const httpService = httpServiceMock.createSetupContract();
    const router = httpService.createRouter('') as jest.Mocked<IRouter>;

    const legacyAPI = createLegacyAPI({ spaces });

    const savedObjectsRepositoryMock = createMockSavedObjectsRepository(spacesSavedObjects);

    const log = loggingServiceMock.create().get('spaces');

    const service = new SpacesService(log, () => legacyAPI);
    const spacesService = await service.setup({
      http: (httpService as unknown) as CoreSetup['http'],
      elasticsearch: elasticsearchServiceMock.createSetupContract(),
      authorization: securityMock.createSetup().authz,
      getSpacesAuditLogger: () => ({} as SpacesAuditLogger),
      config$: Rx.of(spacesConfig),
    });

    spacesService.scopedClient = jest.fn((req: any) => {
      return Promise.resolve(
        new SpacesClient(
          null as any,
          () => null,
          null,
          savedObjectsRepositoryMock,
          spacesConfig,
          savedObjectsRepositoryMock,
          req
        )
      );
    });

    initPutSpacesApi({
      externalRouter: router,
      getSavedObjects: () => legacyAPI.savedObjects,
      log,
      spacesService,
    });

    const [routeDefinition, routeHandler] = router.put.mock.calls[0];

    return {
      routeValidation: routeDefinition.validate as RouteSchemas<ObjectType, ObjectType, ObjectType>,
      routeHandler,
      savedObjectsRepositoryMock,
    };
  };

  it('should update an existing space with the provided ID', async () => {
    const payload = {
      id: 'a-space',
      name: 'my updated space',
      description: 'with a description',
      disabledFeatures: [],
    };

    const { routeHandler, savedObjectsRepositoryMock } = await setup();

    const request = httpServerMock.createKibanaRequest({
      params: {
        id: payload.id,
      },
      body: payload,
      method: 'post',
    });

    const response = await routeHandler(mockRouteContext, request, kibanaResponseFactory);

    const { status } = response;

    expect(status).toEqual(200);
    expect(savedObjectsRepositoryMock.update).toHaveBeenCalledTimes(1);
    expect(savedObjectsRepositoryMock.update).toHaveBeenCalledWith('space', 'a-space', {
      name: 'my updated space',
      description: 'with a description',
      disabledFeatures: [],
    });
  });

  it('should allow an empty description', async () => {
    const payload = {
      id: 'a-space',
      name: 'my updated space',
      description: '',
      disabledFeatures: ['foo'],
    };

    const { routeHandler, savedObjectsRepositoryMock } = await setup();

    const request = httpServerMock.createKibanaRequest({
      params: {
        id: payload.id,
      },
      body: payload,
      method: 'post',
    });

    const response = await routeHandler(mockRouteContext, request, kibanaResponseFactory);

    const { status } = response;

    expect(status).toEqual(200);
    expect(savedObjectsRepositoryMock.update).toHaveBeenCalledTimes(1);
    expect(savedObjectsRepositoryMock.update).toHaveBeenCalledWith('space', 'a-space', {
      name: 'my updated space',
      description: '',
      disabledFeatures: ['foo'],
    });
  });

  it('should not require disabledFeatures', async () => {
    const payload = {
      id: 'a-space',
      name: 'my updated space',
      description: '',
    };

    const { routeHandler, routeValidation, savedObjectsRepositoryMock } = await setup();

    const request = httpServerMock.createKibanaRequest({
      params: {
        id: payload.id,
      },
      body: routeValidation.body!.validate(payload),
      method: 'post',
    });

    const response = await routeHandler(mockRouteContext, request, kibanaResponseFactory);

    const { status } = response;

    expect(status).toEqual(200);
    expect(savedObjectsRepositoryMock.update).toHaveBeenCalledTimes(1);
    expect(savedObjectsRepositoryMock.update).toHaveBeenCalledWith('space', 'a-space', {
      name: 'my updated space',
      description: '',
      disabledFeatures: [],
    });
  });

  it('should not allow a new space to be created', async () => {
    const payload = {
      id: 'a-new-space',
      name: 'my new space',
      description: 'with a description',
    };

    const { routeHandler } = await setup();

    const request = httpServerMock.createKibanaRequest({
      params: {
        id: payload.id,
      },
      body: payload,
      method: 'post',
    });

    const response = await routeHandler(mockRouteContext, request, kibanaResponseFactory);

    const { status } = response;

    expect(status).toEqual(404);
  });

  it(`returns http/403 when the license is invalid`, async () => {
    const { routeHandler } = await setup();

    const request = httpServerMock.createKibanaRequest({
      method: 'post',
    });

    const response = await routeHandler(
      mockRouteContextWithInvalidLicense,
      request,
      kibanaResponseFactory
    );

    expect(response.status).toEqual(403);
    expect(response.payload).toEqual({
      message: 'License is invalid for spaces',
    });
  });
});
