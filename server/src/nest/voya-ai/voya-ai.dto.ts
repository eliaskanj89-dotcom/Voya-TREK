import { voyaMaterializeDraftRequestSchema, voyaPlanDraftRequestSchema } from '@trek/shared';
import { createZodDto } from 'nestjs-zod';

export class VoyaPlanDraftDto extends createZodDto(voyaPlanDraftRequestSchema) {}

export class VoyaMaterializeDraftDto extends createZodDto(voyaMaterializeDraftRequestSchema) {}
