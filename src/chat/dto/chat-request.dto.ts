import { IsString, IsNotEmpty, MaxLength, MinLength } from 'class-validator';

export class ChatRequestDto {
    @IsString({ message: 'The message must be a string.' })
    @IsNotEmpty({ message: 'The message cannot be empty.' })
    @MinLength(3, { message: 'The message is too short to process.' })
    @MaxLength(1000, { message: 'The message exceeds the maximum allowed length of 1000 characters.' })
    message!: string;
}