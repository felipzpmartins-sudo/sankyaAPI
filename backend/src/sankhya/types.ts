export type AuthResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

export type GatewayErrorResponse = {
  error?: { codigo: string; descricao: string };
};

type FieldValue = { $?: string };

export type CrudFieldMeta = { name: string };

export type CrudRawResponse = {
  serviceName: string;
  status: "0" | "1";
  statusMessage?: string;
  responseBody?: {
    entities: {
      total: string;
      hasMoreResult: string;
      offsetPage: string;
      metadata: { fields: { field: CrudFieldMeta | CrudFieldMeta[] } };
      entity?: Record<string, FieldValue> | Record<string, FieldValue>[];
    };
  };
};

export type DecodedEntity = Record<string, string | null>;

export type LoadRecordsResult = {
  rows: DecodedEntity[];
  total: number;
  hasMore: boolean;
};
