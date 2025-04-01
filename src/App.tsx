import React from 'react';
import { Upload, X, Table as TableIcon, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { DBService, FileData } from './services/db';

const db = new DBService();

type TabType = 'de' | 'product';

function App() {
  const [deFile, setDeFile] = React.useState<FileData | null>(null);
  const [productFile, setProductFile] = React.useState<FileData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabType>('de');
  const [isProcessed, setIsProcessed] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const rowsPerPage = 5;
  const [dbInitialized, setDbInitialized] = React.useState(false);
  const [isMerging, setIsMerging] = React.useState(false);
  const [mergedData, setMergedData] = React.useState<any[] | null>(null);
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const mergedDataRef = React.useRef<HTMLDivElement>(null);

  const normalizeSKU = (sku: string): string => {
    if (!sku) return '';
    let normalized = sku.trim();
    // Remove B34 prefix if it exists
    if (normalized.startsWith('B34')) {
      normalized = normalized.slice(3);
    }
    // Remove V1 suffix if it exists
    if (normalized.endsWith('V1')) {
      normalized = normalized.slice(0, -2);
    }
    return normalized;
  };

  const handleUniqueDE = (row: any) => {
    const { Description, ...rest } = row;
    return {
      ...rest,
      Description: row['Description 1'] || ''
    };
  };

  const handleUniqueProduct = (row: any) => {
    const title = row.Name || '';
    const parts = title.split(' ');
    // Remove brand name (first word) and SKU
    const cleanTitle = parts.slice(1).join(' ').replace(row.SKU, '').trim();

    const descriptions = [
      row['Description 1'],
      row['Description 2'],
      row['Description 3'],
      row['Description 4'],
      row['Description 5'],
      row['Specifications']
    ].filter(Boolean).join('\n\n');

    return {
      SKU: row.SKU,
      EAN: row.EAN,
      Material: row.Material,
      Title: cleanTitle,
      Subcategory: row.Title,
      Category: row.Category,
      Brand: row.Brand,
      'Product size': row['Product size'],
      'Package size Length': row['Package size L'],
      'Package size Width': row['Package size W'],
      'Package size Height': row['Package size H'],
      'Net weight': row['Net weight'],
      'Gross weight': row['Gross weight'],
      'Volume/CBM': row['Volume/CBM'],
      Color: row.Color,
      Description: descriptions,
      ...Array.from({ length: 12 }, (_, i) => ({
        [`image${i + 1}`]: row[`image${i + 1}`] || ''
      })).reduce((acc, curr) => ({ ...acc, ...curr }), {})
    };
  };

  const mergeRow = (deRow: any, productRow: any) => {
    const title = productRow.Name || '';
    const parts = title.split(' ');
    const cleanTitle = parts.slice(1).join(' ').replace(productRow.SKU, '').trim();

    const descriptions = [
      deRow['Description 1'],
      productRow['Description 1'],
      productRow['Description 2'],
      productRow['Description 3'],
      productRow['Description 4'],
      productRow['Description 5']
    ].filter(Boolean).join('\n\n');

    return {
      SKU: deRow.SKU,
      EAN: deRow.EAN,
      Subcategory: deRow.Category,
      Price: deRow.Price,
      Stock: deRow.Stock,
      Material: productRow.Material,
      Title: cleanTitle,
      Category: productRow.Category,
      Brand: productRow.Brand,
      'Product size': productRow['Product size'],
      'Package size Length': productRow['Package size L'],
      'Package size Width': productRow['Package size W'],
      'Package size Height': productRow['Package size H'],
      'Net weight': productRow['Net weight'],
      'Gross weight': productRow['Gross weight'],
      'Volume/CBM': productRow['Volume/CBM'],
      Color: productRow.Color,
      Description: descriptions,
      ...Array.from({ length: 12 }, (_, i) => ({
        [`image${i + 1}`]: deRow[`image${i + 1}`] || ''
      })).reduce((acc, curr) => ({ ...acc, ...curr }), {})
    };
  };

  const mergeFiles = (deData: any[], productData: any[]) => {
    const deIndex = new Map();
    const productIndex = new Map();
    const merged: any[] = [];

    // Index DE data
    deData.forEach(row => {
      const normalizedSKU = normalizeSKU(row.SKU);
      if (normalizedSKU) {
        deIndex.set(normalizedSKU, row);
      }
    });

    // Index Product data
    productData.forEach(row => {
      const normalizedSKU = normalizeSKU(row.SKU);
      if (normalizedSKU) {
        productIndex.set(normalizedSKU, row);
      }
    });

    // Process matches and DE-only products
    deIndex.forEach((deRow, normalizedSKU) => {
      const productRow = productIndex.get(normalizedSKU);
      if (productRow) {
        merged.push(mergeRow(deRow, productRow));
      } else {
        merged.push(handleUniqueDE(deRow));
      }
    });

    // Process Product-only entries
    productIndex.forEach((productRow, normalizedSKU) => {
      if (!deIndex.has(normalizedSKU)) {
        merged.push(handleUniqueProduct(productRow));
      }
    });

    return merged;
  };

  const downloadCSV = (data: any[]) => {
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'merged_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  React.useEffect(() => {
    const initDB = async () => {
      try {
        await db.init();
        const [savedDeFile, savedProductFile] = await Promise.all([
          db.getFile('deFile'),
          db.getFile('productFile')
        ]);
        
        if (savedDeFile) {
          setDeFile(savedDeFile);
          if (savedDeFile.mergedData) {
            setMergedData(savedDeFile.mergedData);
          }
          if (savedDeFile.content) {
            setIsProcessed(true);
          }
        }
        if (savedProductFile) {
          setProductFile(savedProductFile);
        }
        setDbInitialized(true);
      } catch (error) {
        console.error('Failed to initialize DB:', error);
      }
    };
    
    initDB();
  }, []);

  React.useEffect(() => {
    const updateDB = async () => {
      try {
        if (deFile) {
          await db.saveFile({ ...deFile, id: 'deFile' });
        } else {
          await db.deleteFile('deFile');
        }
      } catch (error) {
        console.error('Failed to update DE file:', error);
      }
    }
    if (dbInitialized) {
      updateDB();
    }
  }, [deFile, dbInitialized]);

  React.useEffect(() => {
    const updateDB = async () => {
      try {
        if (productFile) {
          await db.saveFile({ ...productFile, id: 'productFile' });
        } else {
          await db.deleteFile('productFile');
        }
      } catch (error) {
        console.error('Failed to update Product file:', error);
      }
    }
    if (dbInitialized) {
      updateDB();
    }
  }, [productFile, dbInitialized]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleClear = () => {
    setDeFile(null);
    setProductFile(null);
    setMergedData(null);
    setMergedData(null);
    setIsProcessed(false);
    setCurrentPage(1);
    // Reset file input elements
    const deInput = document.getElementById('de-file') as HTMLInputElement;
    const productInput = document.getElementById('product-file') as HTMLInputElement;
    if (deInput) deInput.value = '';
    if (productInput) productInput.value = '';
  };

  const parseFile = async (file: File): Promise<any[]> => {
    const fileType = file.name.split('.').pop()?.toLowerCase();
    
    if (fileType === 'csv') {
      return parseCsvFile(file);
    } else if (fileType === 'xlsx' || fileType === 'xls') {
      return parseExcelFile(file);
    }
    
    throw new Error('Unsupported file type');
  };

  const parseCsvFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        complete: (results) => resolve(results.data),
        header: true,
        error: (error) => reject(error),
      });
    });
  };

  const parseExcelFile = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
          resolve(jsonData);
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsBinaryString(file);
    });
  };

  const handleProcessFiles = async () => {
    try {
      setIsLoading(true);
      const deInput = document.getElementById('de-file') as HTMLInputElement;
      const productInput = document.getElementById('product-file') as HTMLInputElement;
      
      if (deInput.files?.[0] && productInput.files?.[0]) {
        const deContent = await parseFile(deInput.files[0]);
        const productContent = await parseFile(productInput.files[0]);

        setDeFile(prev => prev ? { ...prev, content: deContent } : null);
        setProductFile(prev => prev ? { ...prev, content: productContent } : null);
        setIsProcessed(true);
        
        // Wait for state updates to complete
        setTimeout(() => {
          tabsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (error) {
      console.error('Error processing files:', error);
      alert('Error processing files. Please make sure they are valid CSV files.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setFile: React.Dispatch<React.SetStateAction<FileData | null>>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileType = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedTypes = ['csv', 'xls', 'xlsx'];

    if (!allowedTypes.includes(fileType)) {
      alert('Please upload only CSV, XLS, or XLSX files');
      event.target.value = '';
      return;
    }

    setFile({
      id: setFile === setDeFile ? 'deFile' : 'productFile',
      name: file.name,
      type: fileType,
      size: file.size,
    });
  };

  const renderTable = (data: any[] | undefined) => {
    if (!data || data.length === 0) return null;
    
    const totalPages = Math.ceil(data.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedData = data.slice(startIndex, startIndex + rowsPerPage);
    const headers = Object.keys(data[0]);
    const isUrl = (str: string) => {
      try {
        new URL(str);
        return true;
      } catch {
        return false;
      }
    };
    
    return (
      <div className="relative">
        <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 md:rounded-lg max-h-[600px]">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {headers.map((header, index) => (
                  <th
                    key={header}
                    className="sticky top-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-normal min-w-[200px] max-w-[300px]"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {headers.map((header) => {
                    const content = row[header];
                    const isUrlContent = typeof content === 'string' && isUrl(content);
                    
                    return (
                    <td 
                      key={header} 
                      className="px-6 py-4 text-sm text-gray-500 min-w-[200px] max-w-[300px]"
                    >
                      <div className="truncate">
                        {isUrlContent ? (
                          <a 
                            href={content}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800"
                            title={typeof content === 'string' ? content : ''}
                          >
                            {new URL(content).pathname}
                          </a>
                        ) : (
                          <span title={typeof content === 'string' ? content : ''}>
                            {typeof content === 'string' && content.length > 50 
                              ? `${content.slice(0, 50)}...` 
                              : content}
                          </span>
                        )}
                      </div>
                    </td>
                  )})}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                currentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`relative ml-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                currentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(startIndex + rowsPerPage, data.length)}
                </span>{' '}
                of <span className="font-medium">{data.length}</span> results
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 ${
                    currentPage === 1 ? 'cursor-not-allowed' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 ${
                    currentPage === totalPages ? 'cursor-not-allowed' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center p-4">
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-700 font-medium">
              {isMerging ? 'Merging Files...' : 'Processing Files...'}
            </p>
          </div>
        </div>
      )}
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-6xl">
        <div className="flex justify-end mb-6">
          <button
            onClick={handleClear}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
          >
            <X className="w-4 h-4" />
            Clear All
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* DE File Input */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              DE File
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                deFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
              } cursor-pointer`}
              onClick={() => document.getElementById('de-file')?.click()}
            >
              <div className="flex flex-col items-center">
                <Upload
                  className={`w-12 h-12 mb-4 ${
                    deFile ? 'text-green-500' : 'text-gray-400'
                  }`}
                />
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(e) => handleFileChange(e, setDeFile)}
                  className="hidden"
                  id="de-file"
                />
                <label
                  htmlFor="de-file"
                  className="text-sm text-center"
                >
                  {deFile ? (
                    <div className="space-y-1">
                      <p className="font-medium text-green-600">{deFile.name}</p>
                      <p className="text-green-500">
                        {(deFile.size / 1024).toFixed(2)} KB • {deFile.type.toUpperCase()}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium text-gray-700">
                        Drop your DE file here or click to browse
                      </p>
                      <p className="text-gray-500">Supports CSV, XLS, XLSX</p>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>

          {/* Product Information Input */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              Product Information
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 transition-colors ${
                productFile ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
              } cursor-pointer`}
              onClick={() => document.getElementById('product-file')?.click()}
            >
              <div className="flex flex-col items-center">
                <Upload
                  className={`w-12 h-12 mb-4 ${
                    productFile ? 'text-green-500' : 'text-gray-400'
                  }`}
                />
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(e) => handleFileChange(e, setProductFile)}
                  className="hidden"
                  id="product-file"
                />
                <label
                  htmlFor="product-file"
                  className="text-sm text-center"
                >
                  {productFile ? (
                    <div className="space-y-1">
                      <p className="font-medium text-green-600">{productFile.name}</p>
                      <p className="text-green-500">
                        {(productFile.size / 1024).toFixed(2)} KB • {productFile.type.toUpperCase()}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium text-gray-700">
                        Drop your Product Information file here or click to browse
                      </p>
                      <p className="text-gray-500">Supports CSV, XLS, XLSX</p>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-6 flex justify-center">
          {!isProcessed && (
            <button
              className={`py-3 px-8 rounded-lg font-medium transition-colors ${
                deFile && productFile
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              disabled={!deFile || !productFile}
              onClick={handleProcessFiles}
            >
              Process Files
            </button>
          )}
        </div>
        {isProcessed && (
          <div className="mt-8" ref={tabsRef}>
            <div className="border-b border-gray-200">
              <nav className="flex space-x-8" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('de')}
                  className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                    ${activeTab === 'de'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <TableIcon className="w-4 h-4" />
                  DE File Data
                </button>
                <button
                  onClick={() => setActiveTab('product')}
                  className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                    ${activeTab === 'product'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <TableIcon className="w-4 h-4" />
                  Product Information Data
                </button>
              </nav>
            </div>
            <div className="mt-4 overflow-hidden">
              {activeTab === 'de' ? renderTable(deFile?.content) : renderTable(productFile?.content)}
            </div>
            {mergedData && (
              <div className="mt-6" ref={mergedDataRef}>
                <h2 className="text-lg font-semibold mb-4">Merged Data</h2>
                {renderTable(mergedData)}
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => downloadCSV(mergedData)}
                    className="flex items-center gap-2 py-3 px-8 rounded-lg font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Download CSV
                  </button>
                </div>
              </div>
            )}
            {!mergedData && (
              <div className="mt-6 flex justify-center">
                <button
                  className={`py-3 px-8 rounded-lg font-medium transition-colors ${
                    isMerging
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                  disabled={isMerging}
                  onClick={async () => {
                    if (!deFile?.content || !productFile?.content) return;
                    
                    setIsMerging(true);
                    try {
                      const merged = mergeFiles(deFile.content, productFile.content);
                      setMergedData(merged);
                      // Save merged data
                      if (deFile) {
                        await db.saveFile({ ...deFile, mergedData: merged });
                      }
                      // Wait for state update before scrolling
                      setTimeout(() => {
                        mergedDataRef.current?.scrollIntoView({ behavior: 'smooth' });
                      }, 100);
                    } catch (error) {
                      console.error('Error merging files:', error);
                      alert('Error merging files. Please check the console for details.');
                    } finally {
                      setIsMerging(false);
                    }
                  }}
                >
                  {isMerging ? 'Merging...' : 'Merge Files'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;