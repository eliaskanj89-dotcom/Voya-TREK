import { Module } from '@nestjs/common';
import { LlmParseModule } from '../llm-parse/llm-parse.module';
import { StructuredGenerationService } from './structured-generation.service';
import { VoyaAiController } from './voya-ai.controller';
import { VoyaAiService } from './voya-ai.service';

@Module({
  imports: [LlmParseModule],
  controllers: [VoyaAiController],
  providers: [StructuredGenerationService, VoyaAiService],
  exports: [VoyaAiService],
})
export class VoyaAiModule {}
