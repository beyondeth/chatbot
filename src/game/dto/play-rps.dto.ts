import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { RpsChoice } from '../enums/game.enum';

export class PlayRpsDto {
  @IsNotEmpty()
  @IsString()
  sender: string; // 카카오톡 사용자 닉네임

  @IsNotEmpty()
  @IsString()
  roomId: string; // 채팅방 ID

  @IsNotEmpty()
  @IsEnum(RpsChoice)
  choice: RpsChoice; // 사용자 선택 (rock, paper, scissors)
}
