import { Module } from '@nestjs/common';
import { DbModule } from '@/infrastructure/db/db.module';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { PasswordService } from '../auth/password.service';

@Module({
  imports: [DbModule],
  providers: [UsersRepository, UsersService, PasswordService],
  exports: [UsersService],
})
export class UsersModule {}
