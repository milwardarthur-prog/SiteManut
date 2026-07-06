import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client, getBucketConfig } from "./aws-config";

function shouldServeInline(contentType: string): boolean {
  return (
    (contentType.startsWith("image/") && contentType !== "image/svg+xml") ||
    contentType.startsWith("video/") ||
    contentType.startsWith("audio/")
  );
}

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic: boolean = false
): Promise<{ uploadUrl: string; cloud_storage_path: string }> {
  const s3 = createS3Client();
  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = isPublic ? `${folderPrefix}public/uploads` : `${folderPrefix}uploads`;
  const cloud_storage_path = `${prefix}/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  return { uploadUrl, cloud_storage_path };
}

export async function initiateMultipartUpload(
  fileName: string,
  contentType: string,
  isPublic: boolean
): Promise<{ uploadId: string; cloud_storage_path: string }> {
  const s3 = createS3Client();
  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = isPublic ? `${folderPrefix}public/uploads` : `${folderPrefix}uploads`;
  const cloud_storage_path = `${prefix}/${Date.now()}-${fileName}`;

  const command = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
  });
  const response = await s3.send(command);
  return { uploadId: response.UploadId ?? "", cloud_storage_path };
}

export async function getPresignedUrlForPart(
  cloud_storage_path: string,
  uploadId: string,
  partNumber: number
): Promise<string> {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  const command = new UploadPartCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function completeMultipartUpload(
  cloud_storage_path: string,
  uploadId: string,
  parts: { ETag: string; PartNumber: number }[]
): Promise<void> {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  const command = new CompleteMultipartUploadCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    UploadId: uploadId,
    MultipartUpload: { Parts: parts },
  });
  await s3.send(command);
}

export async function getFileUrl(
  cloud_storage_path: string,
  contentType: string,
  isPublic: boolean
): Promise<string> {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();

  if (isPublic) {
    const region = process.env.AWS_REGION ?? "us-east-1";
    const encodedPath = cloud_storage_path
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    return `https://${bucketName}.s3.${region}.amazonaws.com/${encodedPath}`;
  }

  const disposition = shouldServeInline(contentType) ? "inline" : "attachment";
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ResponseContentDisposition: disposition,
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

// ── Armazenamento de texto simples (ex: CSV de Checklist / Teste de Carga) ──
// Chave fixa: cada gravação sobrescreve o conteúdo anterior ("substituir tudo").
export function dataKey(name: string): string {
  const { folderPrefix } = getBucketConfig();
  // Usa o prefixo "uploads/" (mesmo dos anexos, já autorizado nas políticas do bucket)
  // para evitar AccessDenied em um prefixo novo.
  return `${folderPrefix}uploads/data/${name}`;
}

export async function putTextObject(
  key: string,
  text: string,
  contentType: string = "text/csv; charset=utf-8"
): Promise<void> {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: text,
      ContentType: contentType,
    })
  );
}

export async function getTextObject(key: string): Promise<string | null> {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
    const body = res.Body as any;
    if (body?.transformToString) return await body.transformToString("utf-8");
    // Fallback (streams Node)
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString("utf-8");
  } catch (e: any) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
    throw e;
  }
}

export async function deleteFile(cloud_storage_path: string): Promise<void> {
  const s3 = createS3Client();
  const { bucketName } = getBucketConfig();
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
  });
  await s3.send(command);
}
