
import { Body, Controller, HttpCode, HttpStatus, Post, } from '@nestjs/common';

import { ProcessBetDto } from './dto/process-bet.dto';
import { WageringService } from './wagering.service';

@Controller('wagers')
export class WageringController {
constructor( 
private readonly wageringService: WageringService, ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async processBet(@Body() dto: ProcessBetDto) {
    return this.wageringService.processBet(dto);
  }
}