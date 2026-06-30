export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TECHNICIAN";
}

export interface EquipmentData {
  id: string;
  equipmentNumber: string;
  name: string;
  description: string | null;
  model: string | null;
  year: number | null;
  currentHorimeter: number;
  location: string | null;
  serialNumber: string | null;
  qrCodeData: string;
  createdAt: string;
  updatedAt: string;
  files?: EquipmentFileData[];
  workOrders?: WorkOrderData[];
}

export interface EquipmentFileData {
  id: string;
  fileName: string;
  cloudStoragePath: string;
  contentType: string;
  isPublic: boolean;
  fileSize: number | null;
  equipmentId: string;
  createdAt: string;
  fileUrl?: string;
}

export interface WorkOrderData {
  id: string;
  orderNumber: number;
  status: string;
  maintenanceType: string;
  horimeter: number | null;
  comments: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  techClosedAt: string | null;
  closedAt: string | null;
  totalTimeMinutes: number | null;
  technicianId: string;
  createdById: string;
  closedById: string | null;
  equipmentId: string;
  technician?: { id: string; name: string; email: string };
  createdBy?: { id: string; name: string };
  closedBy?: { id: string; name: string } | null;
  equipment?: { id: string; equipmentNumber: string; name: string };
  parts?: WorkOrderPartData[];
  helpers?: WorkOrderHelperData[];
  photos?: WorkOrderPhotoData[];
}

export interface WorkOrderPartData {
  id: string;
  description: string;
  quantity: number;
  workOrderId: string;
  createdAt: string;
}

export interface WorkOrderHelperData {
  id: string;
  startTime: string;
  endTime: string | null;
  workOrderId: string;
  helperId: string;
  helper?: { id: string; name: string; email: string };
  createdAt: string;
}

export interface WorkOrderPhotoData {
  id: string;
  fileName: string;
  cloudStoragePath: string;
  contentType: string;
  isPublic: boolean;
  workOrderId: string;
  createdAt: string;
  fileUrl?: string;
}
