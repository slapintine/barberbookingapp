import { all, run } from "../db/query.js";
import { materializeImageReference } from "../services/providerImageStorage.js";

function parseArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function migrate() {
  const providers = await all(`SELECT id, owner_user_id, image, portfolio_json FROM barbers`);
  let migrated = 0;

  for (const provider of providers) {
    const ownerId = provider.owner_user_id || provider.id;
    const image = await materializeImageReference(provider.image, { ownerId, kind: "cover" });
    const portfolio = await Promise.all(parseArray(provider.portfolio_json).map(async (item, index) => ({
      ...item,
      beforeImage: await materializeImageReference(item?.beforeImage || item?.before_image, { ownerId, kind: `portfolio-${index + 1}-before` }),
      afterImage: await materializeImageReference(item?.afterImage || item?.after_image || item?.image, { ownerId, kind: `portfolio-${index + 1}-after` }),
    })));
    await run(`UPDATE barbers SET image = ?, portfolio_json = ? WHERE id = ?`, [image || null, JSON.stringify(portfolio), provider.id]);

    const services = await all(`SELECT id, image FROM barber_services WHERE barber_id = ?`, [provider.id]);
    for (const service of services) {
      const serviceImage = await materializeImageReference(service.image, { ownerId, kind: `service-${service.id}` });
      await run(`UPDATE barber_services SET image = ? WHERE id = ?`, [serviceImage || null, service.id]);
    }

    const team = await all(`SELECT id, image FROM barber_team_members WHERE barber_id = ?`, [provider.id]);
    for (const member of team) {
      const memberImage = await materializeImageReference(member.image, { ownerId, kind: `team-${member.id}` });
      await run(`UPDATE barber_team_members SET image = ? WHERE id = ?`, [memberImage || null, member.id]);
    }
    migrated += 1;
  }

  console.log(`Migrated image references for ${migrated} provider(s).`);
}

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
