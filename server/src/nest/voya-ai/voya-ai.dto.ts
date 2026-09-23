import { voyaMaterializeDraftRequestSchema, voyaPlanDraftRequestSchema, voyaVerifyTripRequestSchema } from '@trek/shared';
import { createZodDto } from 'nestjs-zod';

export class VoyaPlanDraftDto extends createZodDto(voyaPlanDraftRequestSchema) {}

export class VoyaMaterializeDraftDto extends createZodDto(voyaMaterializeDraftRequestSchema) {}

export class VoyaVerifyTripDto extends createZodDto(voyaVerifyTripRequestSchema) {}
