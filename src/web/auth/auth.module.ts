import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { RegisterController } from './register.controller';
import { AuthModule as DomainAuthModule } from '@/domain/auth/auth.module';
import { PlatformSettingsModule } from '@/domain/platform-settings/platform-settings.module';
import { InvitationsModule } from '@/domain/invitations/invitations.module';
import { UsersModule } from '@/domain/users/users.module';

@Module({
  imports: [DomainAuthModule, PlatformSettingsModule, InvitationsModule, UsersModule],
  controllers: [AuthController, RegisterController],
})
export class AuthWebModule {}
