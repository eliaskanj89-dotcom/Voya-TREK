import { Module } from '@nestjs/common';
import { LlmParseModule } from '../llm-parse/llm-parse.module';
import { StructuredGenerationService } from './structured-generation.service';
import { VoyaAiController } from './voya-ai.controller';
import { VoyaAiService } from './voya-ai.service';
import { TripsModule } from '../trips/trips.module';
import { DaysModule } from '../days/days.module';
import { PlacesModule } from '../places/places.module';
import { AssignmentsDomainModule } from '../assignments/assignments-domain.module';

@Module({
  imports: [LlmParseModule, TripsModule, DaysModule, PlacesModule, AssignmentsDomainModule],
  controllers: [VoyaAiController],
  providers: [StructuredGenerationService, VoyaAiService],
  exports: [VoyaAiService],
})
export class VoyaAiModule {}
