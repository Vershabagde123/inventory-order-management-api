import { prisma } from '../../config/database.js';
import type { Role, User } from '../../generated/prisma/client.js';

/** User shape that is safe to return from the API (no password hash). */
export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export const userService = {
  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: number): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  },

  create(data: { name: string; email: string; passwordHash: string; role: Role }): Promise<User> {
    return prisma.user.create({
      data: { name: data.name, email: data.email, password: data.passwordHash, role: data.role },
    });
  },
};
