import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Test account (required)
  const testHash = await bcrypt.hash("johndoe123", 10);
  await prisma.user.upsert({
    where: { email: "john@doe.com" },
    update: {},
    create: {
      email: "john@doe.com",
      name: "Admin Teste",
      password: testHash,
      role: "ADMIN",
    },
  });

  // Gestor account
  const gestorHash = await bcrypt.hash("gestor123", 10);
  await prisma.user.upsert({
    where: { email: "gestor@beltloc.com" },
    update: {},
    create: {
      email: "gestor@beltloc.com",
      name: "Gestor BeltLoc",
      password: gestorHash,
      role: "ADMIN",
    },
  });

  // Técnico account
  const tecnicoHash = await bcrypt.hash("tecnico123", 10);
  await prisma.user.upsert({
    where: { email: "tecnico@beltloc.com" },
    update: {},
    create: {
      email: "tecnico@beltloc.com",
      name: "Técnico BeltLoc",
      password: tecnicoHash,
      role: "TECHNICIAN",
    },
  });

  console.log("Seed concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
