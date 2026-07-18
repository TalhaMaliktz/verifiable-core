import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): object {
    return {
      status: 'operational',
      service: 'smartdocs-backend',
      timestamp: new Date().toISOString(),
      version: 'v0.0.1-alpha', // Enterprise versioning
    };
  }
}
