import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import * as xlsx from "xlsx";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'json';

    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 500 });
    }

    const collectionsToBackup = [
      'users', 
      'documentRequests', 
      'verifications', 
      'notifications', 
      'activityLogs', 
      'systemAlerts', 
      'systemConfig'
    ];
    const backupData: Record<string, any[]> = {};

    for (const collectionName of collectionsToBackup) {
      const snapshot = await adminDb.collection(collectionName).get();
      backupData[collectionName] = [];
      snapshot.forEach((doc: any) => {
        backupData[collectionName].push({ id: doc.id, ...doc.data() });
      });
    }

    // Save the backup timestamp and log the history
    try {
      const now = new Date().toISOString();
      await adminDb.collection('backupLogs').add({
        timestamp: now,
        type: type,
      });

      await adminDb.collection('systemConfig').doc('backup_status').set({
        lastBackupDate: now
      }, { merge: true });
    } catch (e) {
      console.warn("Could not save backup status", e);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (type === 'json') {
      const jsonString = JSON.stringify(backupData, null, 2);
      
      return new NextResponse(jsonString, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="backup-${timestamp}.json"`,
        }
      });
    }

    if (type === 'excel') {
      const wb = xlsx.utils.book_new();
      
      for (const [collectionName, data] of Object.entries(backupData)) {
        if (data.length === 0) {
          const ws = xlsx.utils.json_to_sheet([{ _empty: "No data" }]);
          xlsx.utils.book_append_sheet(wb, ws, collectionName);
          continue;
        }

        const flatData = data.map(item => {
          const flat: any = {};
          for (const [key, val] of Object.entries(item)) {
            flat[key] = typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
          }
          return flat;
        });

        const ws = xlsx.utils.json_to_sheet(flatData);
        xlsx.utils.book_append_sheet(wb, ws, collectionName);
      }

      const excelBuffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      return new NextResponse(excelBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="backup-${timestamp}.xlsx"`,
        }
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error: any) {
    console.error("Backup generation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
