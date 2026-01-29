
export type UserRole = 'student' | 'authority' | 'security';

export enum ApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  DECLINED = 'DECLINED'
}

export interface GatePassApplication {
  id: string;
  studentName: string;
  rollNumber: string;
  program: 'B.Tech' | 'MBA' | 'Phd';
  year: '1' | '2' | '3' | '4';
  place: string;
  purpose: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  contactNumber: string;
  status: ApplicationStatus;
  gatePassNumber?: string;
  outTime?: string;
  inTime?: string;
  submittedAt: string;
  declineReason?: string;
}

export interface User {
  id: string;
  role: UserRole;
  identifier: string; // email or phone
  name: string;
}
