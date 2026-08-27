import {
    IsString,
    IsNotEmpty,
    IsOptional,
    IsArray,
    IsUUID,
    ArrayMinSize,
    ArrayMaxSize,
    MinLength,
    MaxLength
} from 'class-validator';

export class ChatRequestDto {
    @IsString({ message: 'The message must be a string.' })
    @IsNotEmpty({ message: 'The message cannot be empty.' })
    @MinLength(3, { message: 'The message is too short to process.' })
    @MaxLength(1000, { message: 'The message exceeds the maximum allowed length of 1000 characters.' })
    message!: string;

    @IsOptional()
    @IsArray({ message: 'documentIds must be an array of UUID strings.' })
    @ArrayMinSize(1, { message: 'If documentIds is provided, it must contain at least 1 document ID.' })
    @ArrayMaxSize(50, { message: 'Cannot query more than 50 documents simultaneously to protect memory limits.' })
    @IsUUID('4', { each: true, message: 'Every element in documentIds must be a valid UUIDv4 identifier.' })
    documentIds?: string[];
}