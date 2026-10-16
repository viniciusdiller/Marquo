import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedPlatformAdmin } from "../platform-admin.config";

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPlatformAdmin =>
    context.switchToHttp().getRequest().platformAdmin,
);
