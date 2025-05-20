import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, never>
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const options: Prisma.PrismaClientOptions = {
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    };
    super(options);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
