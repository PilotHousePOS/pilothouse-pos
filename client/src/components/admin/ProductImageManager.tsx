import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { 
  Grid3X3,
  Search,
  X,
  RefreshCw,
  Download,
  Upload,
  AlertTriangle,
  Loader2,
  Save,
  CheckCircle2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatCategory } from "@/lib/formatCategory";

interface BatchSearchResult {
  productId: number;
  productName: string;
  brand: string | null;
  success: boolean;
  searchQuery: string;
  imageUrl: string | null;
  approved: boolean;
  error: string | null;
}

interface ProductImageUploadZoneProps {
  productId: number;
  onImageUploaded: (storedPath: string) => void;
}

function ProductImageUploadZone({ productId, onImageUploaded }: ProductImageUploadZoneProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch(`/api/admin/supplies/${productId}/upload-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
      }

      const result = await response.json();
      onImageUploaded(result.storedPath);
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600'
      }`}
    >
      {isUploading ? (
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Uploading...</span>
        </div>
      ) : (
        <>
          <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Drag & drop an image here, or
          </p>
          <label className="cursor-pointer">
            <span className="text-blue-600 hover:text-blue-700 font-medium">browse files</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}

export default function ProductImageManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedBrand, setSelectedBrand] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showProducts, setShowProducts] = useState(false);
  const [showMissingOnly, setShowMissingOnly] = useState(true);
  
  const [isBatchSearching, setIsBatchSearching] = useState(false);
  const [batchSearchProgress, setBatchSearchProgress] = useState(0);
  const [batchSearchTotal, setBatchSearchTotal] = useState(0);
  const [batchSearchResults, setBatchSearchResults] = useState<BatchSearchResult[]>([]);
  const [maxProducts, setMaxProducts] = useState(20);
  const [showBatchResults, setShowBatchResults] = useState(false);
  
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const { data: imageStats, isLoading: statsLoading } = useQuery({
    queryKey: ['/api/admin/supplies/image-stats'],
  });

  const { data: productsData, isLoading: productsLoading, refetch: refetchProducts } = useQuery({
    queryKey: ['/api/admin/supplies/by-filter', selectedBrand, selectedCategory, searchQuery, showMissingOnly],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100', offset: '0' });
      if (selectedBrand) params.append('brand', selectedBrand);
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('missingOnly', showMissingOnly ? 'true' : 'false');
      
      const response = await fetch(`/api/admin/supplies/by-filter?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    enabled: showProducts,
  });

  const updateImageMutation = useMutation({
    mutationFn: async ({ productId, imageUrl }: { productId: number; imageUrl: string }) => {
      await apiRequest('PUT', `/api/admin/supplies/${productId}/image`, { imageUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/without-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
      
      toast({
        title: 'Success',
        description: 'Product image updated successfully',
      });
      setSelectedProduct(null);
      setImageUrl('');
      refetchProducts();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update product image',
        variant: 'destructive',
      });
    },
  });

  const batchUpdateMutation = useMutation({
    mutationFn: async (updates: { productId: number; imageUrl: string }[]) => {
      for (const update of updates) {
        await apiRequest('PUT', `/api/admin/supplies/${update.productId}/image`, { 
          imageUrl: update.imageUrl 
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/without-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
      
      toast({
        title: 'Success',
        description: 'Batch images updated successfully',
      });
      setBatchSearchResults([]);
      setShowBatchResults(false);
      refetchProducts();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update batch images',
        variant: 'destructive',
      });
    },
  });

  const downloadImageMutation = useMutation({
    mutationFn: async ({ productId, externalUrl }: { productId: number; externalUrl: string }) => {
      const response = await apiRequest('POST', `/api/admin/supplies/${productId}/download-image`, { externalUrl });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/without-images'] });
      queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
      
      toast({
        title: 'Success',
        description: 'Image downloaded and stored permanently',
      });
      setSelectedProduct(null);
      setImageUrl('');
      refetchProducts();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to download and store image',
        variant: 'destructive',
      });
    },
  });

  const handleStartBatchSearch = async () => {
    if (!products || products.length === 0) {
      toast({
        title: 'No products',
        description: 'No products available to search',
        variant: 'destructive',
      });
      return;
    }

    const productIds = products.slice(0, maxProducts).map((p: any) => p.id);
    
    setIsBatchSearching(true);
    setBatchSearchProgress(0);
    setBatchSearchTotal(productIds.length);
    setBatchSearchResults([]);

    try {
      const response = await fetch('/api/admin/supplies/batch-image-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productIds, maxProducts }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || 'Batch search failed');
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.results)) {
        const validResults = data.results.filter((r: any) => 
          r && typeof r.productId === 'number' && r.productName
        );
        
        setBatchSearchResults(validResults as BatchSearchResult[]);
        setShowBatchResults(true);
        
        const successCount = validResults.filter((r: BatchSearchResult) => r.success).length;
        const errorCount = validResults.filter((r: BatchSearchResult) => !r.success).length;
        
        toast({
          title: 'Search Complete',
          description: `Processed ${data.processed} products. ${successCount} successful${errorCount > 0 ? `, ${errorCount} failed` : ''}. Review results below.`,
        });
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error: any) {
      console.error('Batch search error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to perform batch search',
        variant: 'destructive',
      });
    } finally {
      setIsBatchSearching(false);
    }
  };

  const handleSaveBatchResults = () => {
    const approved = batchSearchResults.filter(r => r.approved && r.imageUrl);
    
    if (approved.length === 0) {
      toast({
        title: 'No images selected',
        description: 'Please approve at least one image to save',
        variant: 'destructive',
      });
      return;
    }

    const updates = approved.map(r => ({
      productId: r.productId,
      imageUrl: r.imageUrl!,
    }));

    batchUpdateMutation.mutate(updates);
  };

  const toggleApproval = (index: number) => {
    setBatchSearchResults(prev => 
      prev.map((r, i) => i === index ? { ...r, approved: !r.approved } : r)
    );
  };

  const updateBatchResultImage = (index: number, imageUrl: string) => {
    setBatchSearchResults(prev =>
      prev.map((r, i) => i === index ? { ...r, imageUrl, approved: true } : r)
    );
  };

  const handleBrandSearch = (brand: string) => {
    setSelectedBrand(brand);
    setSelectedCategory('');
    setSearchQuery('');
    setShowProducts(true);
  };

  const handleCategorySearch = (category: string) => {
    setSelectedCategory(category);
    setSelectedBrand('');
    setSearchQuery('');
    setShowProducts(true);
  };

  const handleManualSearch = () => {
    setSelectedBrand('');
    setSelectedCategory('');
    setShowProducts(true);
  };

  const products = productsData || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid3X3 className="w-5 h-5" />
            Product Image Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="text-center py-4">Loading statistics...</div>
          ) : imageStats ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{(imageStats as any).totalProducts || 0}</div>
                  <div className="text-sm text-gray-600">Total Products</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{(imageStats as any).withImages || 0}</div>
                  <div className="text-sm text-gray-600">With Images</div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{(imageStats as any).withoutImages || 0}</div>
                  <div className="text-sm text-gray-600">Missing Images</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Top Brands Needing Images</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {((imageStats as any).byBrand || []).slice(0, 10).map((brand: any) => (
                    <div key={brand.brand} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded">
                      <span className="font-medium">{brand.brand}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-600">Total: {brand.total}</span>
                        <span className="text-red-600">Missing: {brand.withoutImages}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleBrandSearch(brand.brand)}
                        >
                          Search
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3">Categories</h3>
                <div className="flex items-center gap-4 mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={showMissingOnly}
                      onChange={(e) => setShowMissingOnly(e.target.checked)}
                      className="rounded"
                    />
                    Show only products missing images
                  </label>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {((imageStats as any).byCategory || []).slice(0, 10).map((cat: any) => (
                    <div key={cat.category} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded">
                      <span className="font-medium">{formatCategory(cat.category)}</span>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-600">Total: {cat.total}</span>
                        <span className="text-red-600">Missing: {cat.withoutImages}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCategorySearch(cat.category)}
                        >
                          {showMissingOnly ? 'Missing' : 'All'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Sync Images by Name
          </CardTitle>
          <CardDescription>
            Match images from Object Storage to products by name/brand. Works across environments where product IDs differ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
            <p className="text-blue-800 dark:text-blue-300">
              Images are stored in shared Object Storage. This matches products to images by their name and brand instead of ID.
            </p>
          </div>
          
          <Button
            onClick={async () => {
              setIsImporting(true);
              setImportResult(null);
              try {
                const response = await fetch('/api/admin/supplies/sync-images-by-name', {
                  method: 'POST',
                  credentials: 'include',
                });
                
                if (!response.ok) {
                  throw new Error('Sync failed');
                }
                
                const result = await response.json();
                setImportResult({
                  totalImages: result.totalImages,
                  matched: result.matched,
                  unmatched: result.unmatched,
                  totalProducts: result.totalProducts
                });
                
                toast({
                  title: "Sync Complete",
                  description: `Matched ${result.matched} products to images`
                });
                
                queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
              } catch (error) {
                toast({
                  title: "Sync failed",
                  description: error instanceof Error ? error.message : "Failed to sync images",
                  variant: "destructive"
                });
              } finally {
                setIsImporting(false);
              }
            }}
            disabled={isImporting}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isImporting ? 'animate-spin' : ''}`} />
            {isImporting ? 'Syncing...' : 'Sync Images by Name'}
          </Button>
          
          {importResult && importResult.matched !== undefined && (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-sm">
              <div className="font-semibold text-green-700 dark:text-green-400 mb-2">Sync Results</div>
              <div className="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
                <div>Images in storage: {importResult.totalImages}</div>
                <div>Products in database: {importResult.totalProducts}</div>
                <div className="text-green-600">Matched: {importResult.matched}</div>
                <div className="text-yellow-600">Unmatched: {importResult.unmatched}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export/Import Image URLs
          </CardTitle>
          <CardDescription>
            Export image URLs from development and import them into the published app to sync all product photos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
            <p className="text-amber-800 dark:text-amber-300">
              <strong>Step 1:</strong> Export image URLs from this development environment.<br/>
              <strong>Step 2:</strong> Open the published app's admin panel and import the JSON file.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                window.open('/api/admin/supplies/export-image-urls', '_blank');
                toast({
                  title: "Export Started",
                  description: "Downloading image URLs JSON file..."
                });
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Image URLs
            </Button>

            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  setIsImporting(true);
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    const response = await fetch('/api/admin/supplies/import-image-urls', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify(data)
                    });
                    
                    if (!response.ok) {
                      const error = await response.json();
                      throw new Error(error.message || 'Import failed');
                    }
                    
                    const result = await response.json();
                    setImportResult(result);
                    
                    toast({
                      title: "Import Complete",
                      description: `Updated ${result.updated} product image URLs`
                    });
                    
                    queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                    queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
                  } catch (error) {
                    toast({
                      title: "Import failed",
                      description: error instanceof Error ? error.message : "Failed to import image URLs",
                      variant: "destructive"
                    });
                  } finally {
                    setIsImporting(false);
                    e.target.value = '';
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={isImporting}
              />
              <Button
                className="bg-green-600 hover:bg-green-700 text-white pointer-events-none"
                disabled={isImporting}
              >
                <Upload className="w-4 h-4 mr-2" />
                {isImporting ? 'Importing...' : 'Import Image URLs'}
              </Button>
            </div>
          </div>
          
          {importResult && importResult.updated !== undefined && (
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg text-sm">
              <div className="font-semibold text-green-700 dark:text-green-400 mb-2">Import Results</div>
              <div className="grid grid-cols-2 gap-2 text-gray-700 dark:text-gray-300">
                <div>Total in file: {importResult.totalInImport}</div>
                <div className="text-green-600">Updated: {importResult.updated}</div>
                <div className="text-yellow-600">Skipped: {importResult.skipped}</div>
                <div className="text-red-600">Not found: {importResult.notFound}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Product Image Search</CardTitle>
          <CardDescription>
            Search for individual products and add image URLs from major distributors (Chewy, Petco, PetSmart)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                placeholder="Search by product name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button variant="outline" onClick={handleManualSearch}>
              <Search className="w-4 h-4" />
            </Button>
          </div>

          {showProducts && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {selectedBrand ? `Brand: ${selectedBrand}` : 
                   selectedCategory ? `Category: ${selectedCategory}` : 
                   'Search Results'}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowProducts(false);
                    setSelectedBrand('');
                    setSelectedCategory('');
                    setSearchQuery('');
                  }}
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear
                </Button>
              </div>

              {productsLoading ? (
                <div className="text-center py-4">Loading products...</div>
              ) : products.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No products found</div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {products.map((product: any) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-3 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                      onClick={() => {
                        setSelectedProduct(product);
                        setImageUrl(product.imageUrl || '');
                      }}
                    >
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-gray-600">
                          {product.brand && <span>Brand: {product.brand} | </span>}
                          <span>Category: {formatCategory(product.category)}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="outline">
                        Add Image
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedProduct && (
            <div className="border rounded-lg p-4 space-y-4 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Edit Image for: {selectedProduct.name}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedProduct(null);
                    setImageUrl('');
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div>
                <p className="text-sm text-gray-600">Brand: {selectedProduct.brand || 'Unknown'}</p>
                <p className="text-sm text-gray-600">Category: {formatCategory(selectedProduct.category)}</p>
              </div>

              <ProductImageUploadZone 
                productId={selectedProduct.id}
                onImageUploaded={(storedPath) => {
                  queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/image-stats'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/admin/supplies/by-filter'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/supplies'] });
                  toast({
                    title: 'Success',
                    description: 'Image uploaded and stored permanently!',
                  });
                  setSelectedProduct(null);
                  setImageUrl('');
                  refetchProducts();
                }}
              />

              <div className="border-t pt-4 mt-4">
                <p className="text-sm font-medium mb-2">Or use a URL:</p>
                <div className="space-y-2">
                  <Input
                    placeholder="Paste image URL from distributor website..."
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                  />
                  {imageUrl && (
                    <div className="border rounded p-2 bg-white">
                      <img 
                        src={imageUrl} 
                        alt="Preview" 
                        className="max-w-xs max-h-48 object-contain mx-auto"
                        onError={(e) => {
                          e.currentTarget.src = '/placeholder-supply.jpg';
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Button
                    onClick={() => {
                      downloadImageMutation.mutate({
                        productId: selectedProduct.id,
                        externalUrl: imageUrl,
                      });
                    }}
                    disabled={!imageUrl || downloadImageMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {downloadImageMutation.isPending ? 'Downloading...' : 'Download & Store from URL'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedProduct(null);
                      setImageUrl('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Batch Image Search</CardTitle>
          <CardDescription>
            Search for images for all products in a specific brand or category
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800 dark:text-yellow-200">
                <p className="font-semibold mb-1">Cost Management</p>
                <p>Web searches consume your monthly Replit credits. Batch searching {((imageStats as any)?.totalProducts) || 7316} products may use significant credits. Search selectively by brand or category to manage costs.</p>
              </div>
            </div>
          </div>

          {selectedBrand && (
            <div className="border rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Selected Brand: {selectedBrand}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedBrand('');
                    setShowBatchResults(false);
                    setBatchSearchResults([]);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="max-products">Number of products to process (max 50)</Label>
                  <Input
                    id="max-products"
                    type="number"
                    min="1"
                    max="50"
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(Math.min(50, Math.max(1, parseInt(e.target.value) || 20)))}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {products?.length || 0} products available without images
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleStartBatchSearch}
                    disabled={isBatchSearching || !products || products.length === 0}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isBatchSearching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Start Batch Search
                      </>
                    )}
                  </Button>
                </div>

                {isBatchSearching && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Processing products...</span>
                      <span>{batchSearchProgress} / {batchSearchTotal}</span>
                    </div>
                    <Progress value={(batchSearchProgress / batchSearchTotal) * 100} />
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedCategory && (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold capitalize">Selected Category: {selectedCategory}</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCategory('');
                    setShowBatchResults(false);
                    setBatchSearchResults([]);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="max-products-cat">Number of products to process (max 50)</Label>
                  <Input
                    id="max-products-cat"
                    type="number"
                    min="1"
                    max="50"
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(Math.min(50, Math.max(1, parseInt(e.target.value) || 20)))}
                    className="mt-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {products?.length || 0} products available without images
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleStartBatchSearch}
                    disabled={isBatchSearching || !products || products.length === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isBatchSearching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Start Batch Search
                      </>
                    )}
                  </Button>
                </div>

                {isBatchSearching && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Processing products...</span>
                      <span>{batchSearchProgress} / {batchSearchTotal}</span>
                    </div>
                    <Progress value={(batchSearchProgress / batchSearchTotal) * 100} />
                  </div>
                )}
              </div>
            </div>
          )}

          {showBatchResults && batchSearchResults.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Batch Search Results</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowBatchResults(false);
                      setBatchSearchResults([]);
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
                <CardDescription>
                  Review and approve images before saving. You can manually edit image URLs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Note:</strong> Automated web search is preparing search queries for you. 
                    For each product, use the provided search query to find images on distributor websites 
                    (Chewy, Petco, PetSmart, Amazon), then paste the image URL below.
                  </p>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {batchSearchResults.map((result, index) => (
                    <div 
                      key={result.productId} 
                      className={`border rounded-lg p-4 space-y-3 ${result.success ? 'bg-white dark:bg-gray-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{result.productName}</h4>
                          {result.brand && (
                            <p className="text-sm text-gray-600">Brand: {result.brand}</p>
                          )}
                          {result.error && (
                            <p className="text-sm text-red-600 mt-1">
                              <strong>Error:</strong> {result.error}
                            </p>
                          )}
                          {result.success && result.searchQuery && (
                            <p className="text-xs text-gray-500 mt-1 break-all">
                              <strong>Search:</strong> {result.searchQuery}
                            </p>
                          )}
                        </div>
                        <Badge 
                          variant={result.success ? (result.approved ? "default" : "outline") : "destructive"}
                          className={result.approved ? "bg-green-600" : ""}
                        >
                          {result.success ? (result.approved ? "Approved" : "Pending") : "Failed"}
                        </Badge>
                      </div>

                      {result.success && (
                        <div className="space-y-2">
                          <Label>Image URL</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Paste image URL here..."
                              value={result.imageUrl || ''}
                              onChange={(e) => updateBatchResultImage(index, e.target.value)}
                            />
                            <Button
                              size="sm"
                              variant={result.approved ? "default" : "outline"}
                              onClick={() => toggleApproval(index)}
                              disabled={!result.imageUrl}
                            >
                              {result.approved ? <CheckCircle2 className="w-4 h-4" /> : "Approve"}
                            </Button>
                          </div>
                          
                          {result.imageUrl && (
                            <div className="border rounded p-2 bg-gray-50 dark:bg-gray-900">
                              <img 
                                src={result.imageUrl} 
                                alt="Preview" 
                                className="max-w-xs max-h-32 object-contain mx-auto"
                                onError={(e) => {
                                  e.currentTarget.src = '/placeholder-supply.jpg';
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={handleSaveBatchResults}
                    disabled={batchUpdateMutation.isPending || !batchSearchResults.some(r => r.approved)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {batchUpdateMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save {batchSearchResults.filter(r => r.approved).length} Approved Images
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowBatchResults(false);
                      setBatchSearchResults([]);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
