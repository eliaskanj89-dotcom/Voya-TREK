import { Body, Controller, HttpException, Post, UseGuards } from '@nestjs/common';
import type { User } from '../../types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StructuredGenerationError } from './structured-generation.service';
import { VoyaMaterializeDraftDto, VoyaPlanDraftDto, VoyaVerifyTripDto } from './voya-ai.dto';
import {
  VoyaAiInvalidDraftError,
  VoyaAiPermissionError,
  VoyaAiService,
  VoyaAiUnavailableError,
} from './voya-ai.service';

@Controller('api/voya-ai')
@UseGuards(JwtAuthGuard)
export class VoyaAiController {
  constructor(private readonly voya: VoyaAiService) {}

  @Post('materialize-draft')
  materializeDraft(@CurrentUser() user: User, @Body() body: VoyaMaterializeDraftDto) {
    try {
      return this.voya.materializeDraft(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_INVALID_DRAFT' }, 400);
      }
      console.error('Voya AI materialization failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not create this trip', code: 'VOYA_AI_MATERIALIZE_ERROR' }, 500);
    }
  }

  @Post('verify-trip')
  async verifyTrip(@CurrentUser() user: User, @Body() body: VoyaVerifyTripDto) {
    try {
      return await this.voya.verifyTrip(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      console.error('Voya trip verification failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not verify this trip right now', code: 'VOYA_AI_VERIFY_ERROR' }, 500);
    }
  }

  @Post('plan-draft')
  async planDraft(@CurrentUser() user: User, @Body() body: VoyaPlanDraftDto) {
    try {
      return { draft: await this.voya.planDraft(user.id, body) };
    } catch (error) {
      if (error instanceof VoyaAiUnavailableError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_NOT_CONFIGURED' }, 409);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_INVALID_DRAFT' }, 502);
      }
      if (error instanceof StructuredGenerationError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_PROVIDER_ERROR' }, 502);
      }
      console.error('Voya AI plan draft failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not generate this trip right now', code: 'VOYA_AI_ERROR' }, 500);
    }
  }
}
