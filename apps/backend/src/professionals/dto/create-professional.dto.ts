import { Trim } from "../../common/decorators/trim.decorator";
import { ArrayMaxSize, ArrayUnique, IsArray, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";
import { NormalizeEmail } from "../../common/decorators/normalize-email.decorator";

export class CreateProfessionalDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Trim()
  name!: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  initialPassword!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Trim()
  bio?: string;

  // Serviços que o profissional já atende desde o cadastro (opcional; ver CreateProfessionalDto no service). Só ids: o
  // serviço precisa ser do MESMO negócio, o que o service confere no banco. Teto de tamanho e de repetição.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  serviceIds?: string[];
}
