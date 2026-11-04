import { lovable } from "@/integrations/lovable";

/**
 * Ponto central para integrações externas (OAuth e futuros conectores de mensageria).
 */
export const externalIntegrations = {
  auth: lovable.auth,
};

