import XLSX from 'xlsx';

async function checkData() {
  const workbook = XLSX.readFile('attached_assets/Final Animal House Inventory for EXATOUCH_1762812498989.xlsx');
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  console.log('First 5 rows:');
  for (let i = 0; i < 5 && i < data.length; i++) {
    const row: any = data[i];
    console.log(`\nRow ${i + 1}:`);
    console.log('  TRUE:', row.TRUE);
    console.log('  Description:', row.Description);
    console.log('  Category:', row['Category ']);
    console.log('  Price:', row.Price);
    console.log('  QtyOnHand:', row.QtyOnHand);
    console.log('  Mfg:', row.Mfg);
  }
}

checkData();
