import { Body, Controller, HttpException, Post, UseGuards } from '@nestjs/common';
import type { User } from '../../types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StructuredGenerationError } from './structured-generation.service';
import { VoyaApplyDayEditDto, VoyaApplyTripEditDto, VoyaDayEditDto, VoyaEditHistoryDto, VoyaMaterializeDraftDto, VoyaMaterializeMultiCityDraftDto, VoyaMultiCityPlanDto, VoyaPlanDraftDto, VoyaRestoreEditSnapshotDto, VoyaTripEditDto, VoyaVerifyTripDto, VoyaReadinessBuildDto, VoyaReadinessStatusDto, VoyaDestinationDiscoveryDto } from './voya-ai.dto';
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

  @Post('discover-destinations')
  async discoverDestinations(@CurrentUser() user: User, @Body() body: VoyaDestinationDiscoveryDto) {
    try {
      return await this.voya.discoverDestinations(user, body);
    } catch (error) {
      if (error instanceof VoyaAiUnavailableError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_NOT_CONFIGURED' }, 409);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_DISCOVERY_INVALID_RESULT' }, 502);
      }
      if (error instanceof StructuredGenerationError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_PROVIDER_ERROR' }, 502);
      }
      console.error('Voya destination discovery failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not discover destinations right now', code: 'VOYA_DISCOVERY_ERROR' }, 500);
    }
  }

  @Post('readiness')
  readiness(@CurrentUser() user: User, @Body() body: VoyaReadinessBuildDto) {
    try {
      return this.voya.getReadiness(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      throw new HttpException({ error: 'Voya could not load trip readiness', code: 'VOYA_READINESS_ERROR' }, 500);
    }
  }

  @Post('readiness-refresh')
  async refreshReadiness(@CurrentUser() user: User, @Body() body: VoyaReadinessBuildDto) {
    try {
      return await this.voya.refreshReadiness(user, body);
    } catch (error) {
      if (error instanceof VoyaAiUnavailableError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_NOT_CONFIGURED' }, 409);
      }
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError || error instanceof StructuredGenerationError) {
        throw new HttpException({ error: error.message, code: 'VOYA_READINESS_GENERATION_ERROR' }, 502);
      }
      console.error('Voya readiness refresh failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not refresh trip readiness', code: 'VOYA_READINESS_ERROR' }, 500);
    }
  }

  @Post('readiness-status')
  readinessStatus(@CurrentUser() user: User, @Body() body: VoyaReadinessStatusDto) {
    try {
      return this.voya.updateReadinessStatus(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_READINESS_ITEM_NOT_FOUND' }, 404);
      }
      throw new HttpException({ error: 'Voya could not update readiness', code: 'VOYA_READINESS_ERROR' }, 500);
    }
  }

  @Post('multi-city-draft')
  async multiCityDraft(@CurrentUser() user: User, @Body() body: VoyaMultiCityPlanDto) {
    try {
      return { draft: await this.voya.planMultiCityDraft(user.id, body) };
    } catch (error) {
      if (error instanceof VoyaAiUnavailableError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_NOT_CONFIGURED' }, 409);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_INVALID_MULTI_CITY_DRAFT' }, 502);
      }
      if (error instanceof StructuredGenerationError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_PROVIDER_ERROR' }, 502);
      }
      console.error('Voya multi-city planning failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not generate this multi-city trip right now', code: 'VOYA_AI_MULTI_CITY_ERROR' }, 500);
    }
  }

  @Post('materialize-multi-city-draft')
  materializeMultiCityDraft(@CurrentUser() user: User, @Body() body: VoyaMaterializeMultiCityDraftDto) {
    try {
      return this.voya.materializeMultiCityDraft(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_INVALID_MULTI_CITY_DRAFT' }, 400);
      }
      console.error('Voya multi-city materialization failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not create this multi-city trip', code: 'VOYA_AI_MULTI_CITY_MATERIALIZE_ERROR' }, 500);
    }
  }

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

  @Post('edit-history')
  editHistory(@CurrentUser() user: User, @Body() body: VoyaEditHistoryDto) {
    try {
      return this.voya.listEditHistory(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      throw new HttpException({ error: 'Voya could not load edit history', code: 'VOYA_HISTORY_ERROR' }, 500);
    }
  }

  @Post('restore-edit-snapshot')
  restoreEditSnapshot(@CurrentUser() user: User, @Body() body: VoyaRestoreEditSnapshotDto) {
    try {
      return this.voya.restoreEditSnapshot(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_HISTORY_RESTORE_CONFLICT' }, 409);
      }
      console.error('Voya edit history restore failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not restore this version', code: 'VOYA_HISTORY_RESTORE_ERROR' }, 500);
    }
  }

  @Post('trip-edit-plan')
  async tripEditPlan(@CurrentUser() user: User, @Body() body: VoyaTripEditDto) {
    try {
      return { plan: await this.voya.planTripEdit(user, body) };
    } catch (error) {
      if (error instanceof VoyaAiUnavailableError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_NOT_CONFIGURED' }, 409);
      }
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_INVALID_TRIP_EDIT' }, 502);
      }
      if (error instanceof StructuredGenerationError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_PROVIDER_ERROR' }, 502);
      }
      console.error('Voya trip edit plan failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not plan this trip edit right now', code: 'VOYA_AI_TRIP_EDIT_ERROR' }, 500);
    }
  }

  @Post('apply-trip-edit')
  applyTripEdit(@CurrentUser() user: User, @Body() body: VoyaApplyTripEditDto) {
    try {
      return this.voya.applyTripEdit(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_STALE_TRIP_EDIT' }, 409);
      }
      console.error('Voya whole-trip apply failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not apply this whole-trip edit', code: 'VOYA_AI_APPLY_TRIP_EDIT_ERROR' }, 500);
    }
  }

  @Post('day-edit-draft')
  async dayEditDraft(@CurrentUser() user: User, @Body() body: VoyaDayEditDto) {
    try {
      return { draft: await this.voya.planDayEdit(user, body) };
    } catch (error) {
      if (error instanceof VoyaAiUnavailableError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_NOT_CONFIGURED' }, 409);
      }
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_INVALID_DAY_EDIT' }, 502);
      }
      if (error instanceof StructuredGenerationError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_PROVIDER_ERROR' }, 502);
      }
      console.error('Voya day edit draft failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not redesign this day right now', code: 'VOYA_AI_DAY_EDIT_ERROR' }, 500);
    }
  }

  @Post('apply-day-edit')
  applyDayEdit(@CurrentUser() user: User, @Body() body: VoyaApplyDayEditDto) {
    try {
      return this.voya.applyDayEdit(user, body);
    } catch (error) {
      if (error instanceof VoyaAiPermissionError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_FORBIDDEN' }, 403);
      }
      if (error instanceof VoyaAiInvalidDraftError) {
        throw new HttpException({ error: error.message, code: 'VOYA_AI_STALE_DAY_EDIT' }, 409);
      }
      console.error('Voya day edit apply failed:', error instanceof Error ? error.message : 'unknown error');
      throw new HttpException({ error: 'Voya could not apply this day edit', code: 'VOYA_AI_APPLY_DAY_EDIT_ERROR' }, 500);
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
