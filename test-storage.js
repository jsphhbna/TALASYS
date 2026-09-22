const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

const app1 = initializeApp({
  credential: cert({
    projectId: "talasyssystem",
    clientEmail: "firebase-adminsdk-fbsvc@talasyssystem.iam.gserviceaccount.com",
    privateKey: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDYZqnrtxInsgo4\nkiSPn14E+lVAFqvwXJM+GyC40Zoh8Ztaa0ieGInzZgZ49iatfWf9OVi5mjQ6jIbT\nprpeUjKZ+boYqEC36U8k71iQN4Bfl9ocGKYTyXurW2Tdf8N93bCanb8BMvP54tMV\nWi0a4BhHdKRzmJEJHFOCmgT6rWF3NkI4rPjkJDQ0Qpy3bbajNKf6vnyRg20UTY+s\najX5HibaolsHxo8NXXejRTPdE34je4iiCDI3cz52uHUtP759Clq9rxJIDWhvX4yZ\nA2V2j3tzbpVJE6MG8i88kgRGuDxcxbunM7qhWoMwR2Hovg0frQPJsLlChdvOq+EZ\nRJAWewQRAgMBAAECggEABCIt47qVplwgatqLx+cyO2PGu23Tb0jCvUB1EbgF5YPB\nGms13LiORgUbDDYeIK6RDRq1Jv0a5fVni+UW5pSpB8eSi5mx0XGA7q0tuA9/VxQb\no/FqlrKAt2dhrVjH6gBmjlrYr6lX/1wa+RZFtJ+MMdfjXkaPRVPHr+pzkZA8mN4k\n9kVfziCv/6Ywf/z2solQbqEkPf5nIrrkqW7dbLn/K8A/DdfQih0vqV5NQ51+9qr9\nkvScJPDCCxWwlSeU3aUVfDGfpxRL8bBcai4dV4wyygFaj8ar+HVXi9GInkYJC6pB\nk2SI1M0eeBTPn0/SHPhZRKpPrs4+N6zwFuxkSSG8CwKBgQDwXF9Z23D00Nht48A9\nA4ejcPHJBE2hu81B4j32f4/cfdtYJzBn0lKcay1fz8wkEGkDH3/zX1ylRCSXohhS\n3YcJfZkE3DLm7N3fOz+0C/4SXD5fWHKfDwMxGP9eITTHqraIdtF+UWTlB4GR9ENM\nB5FQoOGJQRqIAdzKtKkMm/ge/wKBgQDmezL8juwBL4Bf8FCpi38C+2JjOTuyx0zc\nMP8vTPTvt91xoUCgyVQLicOmQsU9V8J6ellCGxT/9Pm0z8xhLm9IrDXZeIr8E5Iv\nugWjyKnzJ5ZYRPi6zIy6wehhra3bwbXIwBc02PwSjAjHTooSsslFi2Vsg38XSN/n\njoioJb3s7wKBgEKnexGyFurtF3ex1teUqQKcCZDTDqwxJkSE9uXqjfx5MmCJzZSc\n8KfL2PNe7p95pYVmMNdOtKRn9zXNj607HX12RP7iCYOcYBLNnWbShIyW4/0QzAhr\n41i0M+zojHhqUOAbAxFihPY2VKoi8J6e4p9XXfPwB+l7irzzyIVkozQFAoGBAN3f\nQYDxUO3/PVSd8fiU6gsD1n3wTbDXvPzHShDNw4i09j753U4rIXYOA8McyeU4g2YG\nO8Cwc3HG8U8HLxdqbQSHizszmI/7gyHgsKcvd7M0q72Df/HLEbqDCmJloFVJz+ZW\nTMC6FUcBeT3sNGy1oZ4KB/QDTigrJigyBQnhc0kPAoGBAL+ub6koH0+9kYanNK03\nooj4Lx4w5S/cgdIx97JDGnZNCNYp/wL3Nx2HUqPBW0CaT2hjGthjk+u0Kr+sWnSe\nyeMFXSuzBuFojKf7h2/7T6GdTLImwRTkch5C11cqNWVBY/+tWn/JODFJhU8dCpUd\nqxRRwWbvMuR1eqZKa6QkhPfk\n-----END PRIVATE KEY-----\n",
  })
});

async function testBucket(bucketName) {
  try {
    const bucket = getStorage(app1).bucket(bucketName);
    const [exists] = await bucket.exists();
    console.log(`Bucket ${bucketName} exists:`, exists);
  } catch (err) {
    console.error(`Bucket ${bucketName} error:`, err.message);
  }
}

async function run() {
  await testBucket('talasyssystem.firebasestorage.app');
  await testBucket('talasyssystem.appspot.com');
  process.exit(0);
}

run();
