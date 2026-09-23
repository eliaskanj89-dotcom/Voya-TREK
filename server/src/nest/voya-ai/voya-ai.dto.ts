import { voyaApplyDayEditRequestSchema, voyaApplyTripEditRequestSchema, voyaDayEditRequestSchema, voyaEditHistoryRequestSchema, voyaMaterializeDraftRequestSchema, voyaMaterializeMultiCityDraftRequestSchema, voyaMultiCityPlanRequestSchema, voyaPlanDraftRequestSchema, voyaRestoreEditSnapshotRequestSchema, voyaTripEditRequestSchema, voyaVerifyTripRequestSchema, voyaReadinessBuildRequestSchema, voyaReadinessStatusRequestSchema, voyaDestinationDiscoveryRequestSchema, voyaDestinationResolveRequestSchema } from '@trek/shared';
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

export class VoyaDestinationResolveDto extends createZodDto(voyaDestinationResolveRequestSchema) {}

export class VoyaMultiCityPlanDto extends createZodDto(voyaMultiCityPlanRequestSchema) {}

export class VoyaMaterializeMultiCityDraftDto extends createZodDto(voyaMaterializeMultiCityDraftRequestSchema) {}

export class VoyaApplyTripEditDto extends createZodDto(voyaApplyTripEditRequestSchema) {}

export class VoyaEditHistoryDto extends createZodDto(voyaEditHistoryRequestSchema) {}

export class VoyaRestoreEditSnapshotDto extends createZodDto(voyaRestoreEditSnapshotRequestSchema) {}

export class VoyaTransportAdviceDto extends createZodDto(voyaTransportAdviceRequestSchema) {}
