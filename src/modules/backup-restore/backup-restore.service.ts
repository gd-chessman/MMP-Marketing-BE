import { Injectable } from '@nestjs/common';
import { MongoClient, ObjectId } from 'mongodb';
import { EmailService } from '../../common/services/email.service';
import { readFile } from 'fs/promises';

@Injectable()
export class BackupRetoreService {
  private readonly uri = process.env.DATABASE_URI; // MongoDB URI từ biến môi trường
  private readonly dbName = 'test'; // Tên database của bạn

  constructor(private readonly emailService: EmailService) {}

  async backupAndSendEmail() {
    const client = new MongoClient(this.uri);
  
    try {
      await client.connect();
      const db = client.db(this.dbName);
      const collections = await db.collections();
  
      const backupData: Record<string, any[]> = {};
  
      // Trích xuất dữ liệu từ từng collection
      for (const collection of collections) {
        const name = collection.collectionName;
        const documents = await collection.find().toArray();
  
        // Giữ nguyên ObjectId và Date trong các trường
        const documentsWithSpecialFields = documents.map((doc) => {
          const transformedDoc = { ...doc };
  
          // Kiểm tra và giữ nguyên ObjectId và Date
          for (const key in transformedDoc) {
            if (transformedDoc[key] instanceof ObjectId) {
              transformedDoc[key] = transformedDoc[key].toString();  // Chuyển ObjectId thành chuỗi để giữ đúng cấu trúc
            } else if (transformedDoc[key] instanceof Date) {
              transformedDoc[key] = transformedDoc[key].toISOString();  // Giữ nguyên dạng Date ISO string
            }
          }
  
          return transformedDoc;
        });
  
        if (documentsWithSpecialFields.length > 0) {
          backupData[name] = documentsWithSpecialFields;
        }
      }
  
      if (Object.keys(backupData).length === 0) {
        throw new Error('No data found to back up');
      }

      // Tạo buffer chứa dữ liệu sao lưu
      const backupBuffer = Buffer.from(JSON.stringify(backupData, null, 2));
  
      // Gửi email kèm tệp đính kèm từ bộ nhớ
      await this.emailService.sendMailWithAttachment(
        process.env.EMAIL_USER,
        'Database Backup',
        'Here is the backup of your database.',
        [{ filename: 'backup.json', content: backupBuffer }]
      );
  
      return { message: 'Backup successful and email sent' };
    } catch (error) {
      throw new Error(`Backup failed: ${error.message}`);
    } finally {
      await client.close();
    }
  }

  async restoreFromBackup(fileBuffer: Buffer) {
    const client = new MongoClient(this.uri);
  
    try {
      await client.connect();
      const db = client.db(this.dbName);
  
      // Đọc dữ liệu từ buffer
      const fileContent = fileBuffer.toString('utf-8');
      const backupData: Record<string, any[]> = JSON.parse(fileContent);
  
      // Lấy danh sách tất cả các collection trong cơ sở dữ liệu
      const collections = await db.collections();
      const collectionNames = collections.map(collection => collection.collectionName);
  
      // Xóa tất cả các collection trong cơ sở dữ liệu
      for (const collectionName of collectionNames) {
        const collection = db.collection(collectionName);
        await collection.drop();  // Xóa collection
      }
  
      // Khôi phục dữ liệu từ sao lưu vào các collection mới
      for (const [collectionName, documents] of Object.entries(backupData)) {
        const collection = db.collection(collectionName);
  
        // Chuyển đổi ObjectId từ chuỗi và Date từ ISO string
        const transformedDocuments = documents.map((doc) => {
          const transformedDoc = { ...doc };
  
          // Kiểm tra và chuyển lại ObjectId
          for (const key in transformedDoc) {
            if (transformedDoc[key] && typeof transformedDoc[key] === 'string' && transformedDoc[key].match(/^[0-9a-fA-F]{24}$/)) {
              transformedDoc[key] = new ObjectId(transformedDoc[key]);  // Chuyển chuỗi thành ObjectId
            } else if (transformedDoc[key] && typeof transformedDoc[key] === 'string' && !isNaN(Date.parse(transformedDoc[key]))) {
              transformedDoc[key] = new Date(transformedDoc[key]);  // Chuyển ISO string thành Date
            }
          }
  
          return transformedDoc;
        });
  
        // Chỉ thực hiện insert nếu có dữ liệu
        if (transformedDocuments.length > 0) {
          await collection.insertMany(transformedDocuments);
        }
      }
  
      return { message: 'Restore successful' };
    } catch (error) {
      throw new Error(`Restore failed: ${error.message}`);
    } finally {
      await client.close();
    }
  }
  
}
