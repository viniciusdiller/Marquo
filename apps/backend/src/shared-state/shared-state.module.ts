import { Global, Module } from "@nestjs/common";
import { SharedStateService } from "./shared-state.service";

@Global()
@Module({ providers: [SharedStateService], exports: [SharedStateService] })
export class SharedStateModule {}
