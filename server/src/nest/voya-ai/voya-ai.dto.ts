import { voyaApplyDayEditRequestSchema, voyaDayEditRequestSchema, voyaMaterializeDraftRequestSchema, voyaPlanDraftRequestSchema, voyaVerifyTripRequestSchema } from '@trek/shared';
import { createZodDto } from 'nestjs-zod';

export class VoyaPlanDraftDto extends createZodDto(voyaPlanDraftRequestSchema) {}

export class VoyaMaterializeDraftDto extends createZodDto(voyaMaterializeDraftRequestSchema) {}

export class VoyaVerifyTripDto extends createZodDto(voyaVerifyTripRequestSchema) {}

export class VoyaDayEditDto extends createZodDto(voyaDayEditRequestSchema) {}

export class VoyaApplyDayEditDto extends createZodDto(voyaApplyDayEditRequestSchema) {}
