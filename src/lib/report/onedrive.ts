async function getMicrosoftAccessToken(): Promise<string> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph credentials not configured");
  }

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default"
    }).toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get Microsoft token: ${text}`);
  }

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("Microsoft token response did not include access_token");
  return data.access_token;
}

function encodeDrivePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function graphJson<T>(url: string, init: RequestInit, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${fallbackMessage}: ${text}`);
  }
  return (await response.json()) as T;
}

async function getDriveItemByPath(params: {
  driveId: string;
  accessToken: string;
  path: string;
}): Promise<{ id: string } | null> {
  const itemPath = encodeDrivePath(params.path);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${params.driveId}/root:/${itemPath}`,
    {
      headers: { Authorization: `Bearer ${params.accessToken}` }
    }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to read OneDrive folder: ${text}`);
  }
  return (await response.json()) as { id: string };
}

async function createDriveFolder(params: {
  driveId: string;
  accessToken: string;
  parentId?: string;
  name: string;
}): Promise<{ id: string }> {
  const parentPath = params.parentId
    ? `items/${params.parentId}/children`
    : "root/children";
  return graphJson<{ id: string }>(
    `https://graph.microsoft.com/v1.0/drives/${params.driveId}/${parentPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: params.name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail"
      })
    },
    "Failed to create OneDrive folder"
  );
}

async function ensureReportFolder(driveId: string, accessToken: string) {
  const rootFolder =
    (await getDriveItemByPath({ driveId, accessToken, path: "StocksAI" })) ??
    (await createDriveFolder({ driveId, accessToken, name: "StocksAI" }));

  return (
    (await getDriveItemByPath({ driveId, accessToken, path: "StocksAI/Reports" })) ??
    (await createDriveFolder({
      driveId,
      accessToken,
      parentId: rootFolder.id,
      name: "Reports"
    }))
  );
}

export async function uploadToOneDrive(params: {
  filename: string;
  pdfBuffer: Buffer;
}): Promise<{ webUrl: string }> {
  const driveId = process.env.MICROSOFT_DRIVE_ID;
  if (!driveId) throw new Error("MICROSOFT_DRIVE_ID not configured");

  const accessToken = await getMicrosoftAccessToken();
  await ensureReportFolder(driveId, accessToken);

  const uploadPath = encodeDrivePath(`StocksAI/Reports/${params.filename}`);
  const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${uploadPath}:/content`;
  const body = params.pdfBuffer.buffer.slice(
    params.pdfBuffer.byteOffset,
    params.pdfBuffer.byteOffset + params.pdfBuffer.byteLength
  ) as ArrayBuffer;

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/pdf"
    },
    body
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`OneDrive upload failed: ${text}`);
  }

  const fileData = (await uploadResponse.json()) as { webUrl?: string };
  if (!fileData.webUrl) throw new Error("OneDrive response did not include webUrl");
  return { webUrl: fileData.webUrl };
}
