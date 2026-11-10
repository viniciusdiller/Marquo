import { Trim } from "../../common/decorators/trim.decorator";
import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

// O dono se cadastra como profissional do PRÓPRIO negócio. Não há nome, e-mail nem senha: a conta é a que ele já usa para
// entrar (o userId vem do token, nunca do corpo), então não existe como apontar para a conta de outra pessoa.
export class CreateSelfProfessionalDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @Trim()
  bio?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  serviceIds?: string[];
}
