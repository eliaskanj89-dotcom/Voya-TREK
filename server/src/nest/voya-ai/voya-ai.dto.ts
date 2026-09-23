import { voyaApplyDayEditRequestSchema, voyaDayEditRequestSchema, voyaMaterializeDraftRequestSchema, voyaPlanDraftRequestSchema, voyaTripEditRequestSchema, voyaVerifyTripRequestSchema, voyaReadinessBuildRequestSchema, voyaReadinessStatusRequestSchema, voyaDestinationDiscoveryRequestSchema } from '@trek/shared';
import { createZodDto } from 'nestjs-zod';

export class VoyaPlanDraftDto extends createZodDto(voyaPlanDraftRequestSchema) {}

export class VoyaMaterializeDraftDto extends createZodDto(voyaMaterializeDraftRequestSchema) {}

export class VoyaVerifyTripDto extends createZodDto(voyaVerifyTripRequestSchema) {}

export class VoyaDayEditDto extends createZodDto(voyaDayEditRequestSchema) {}

export class VoyaApplyDayEditDto extends createZodDto(voyaApplyDayEditRequestSchema) {}

export class VoyaTripEditDto extends createZodDto(voyaTripEditRequestSchema) {}

export class VoyaReadinessBuildDto extends createZodDto(voyaReadinessBuildRequestSchema) {}

export class VoyaReadinessStatusDto extends createZodDto(voyaReadinessStatusRequestSchema) {}

export class VoyaDestinationDiscoveryDto extends createZodDto(voyaDestinationDiscoveryRequestSchema) {}
