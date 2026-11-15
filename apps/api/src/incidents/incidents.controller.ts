import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { AuthUser, ProjectContext } from '../auth/auth.types.js';
import { CurrentProject, CurrentUser, RequireProjectAccess } from '../auth/decorators.js';
import { parse } from '../common/zod.js';
import { createIncidentSchema, incidentNoteSchema, listIncidentsQuery, updateIncidentSchema } from './incident.dto.js';
import { IncidentsService } from './incidents.service.js';

@Controller('projects/:projectId/incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @RequireProjectAccess('incident.view')
  list(@Query() query: unknown, @CurrentProject() project: ProjectContext) {
    return this.incidents.list(project, parse(listIncidentsQuery, query).status);
  }

  @Post()
  @RequireProjectAccess('incident.manage')
  create(@Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.incidents.create(project, user.id, parse(createIncidentSchema, body));
  }

  /** `:ref` — insident raqami (INC-3 uchun `3`) yoki id. */
  @Get(':ref')
  @RequireProjectAccess('incident.view')
  get(@Param('ref') ref: string, @CurrentProject() project: ProjectContext) {
    return this.incidents.get(project, ref);
  }

  @Patch(':ref')
  @RequireProjectAccess('incident.manage')
  update(@Param('ref') ref: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.incidents.update(project, user.id, ref, parse(updateIncidentSchema, body));
  }

  @Post(':ref/updates')
  @RequireProjectAccess('incident.manage')
  note(@Param('ref') ref: string, @Body() body: unknown, @CurrentUser() user: AuthUser, @CurrentProject() project: ProjectContext) {
    return this.incidents.note(project, user.id, ref, parse(incidentNoteSchema, body).body);
  }
}
