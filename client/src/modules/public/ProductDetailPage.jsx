import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ImageOff, ArrowLeft, ShieldCheck, Truck, Package, Phone, Mail } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import apiClient from '../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney = (v) => money.format(Number(v || 0));

const ProductDetailPage = () => {
  const { productId } = useParams();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiClient.getProduct(productId);
        setProduct(res?.data || null);
      } catch {
        setError('This product could not be found.');
      } finally {
        setLoading(false);
      }
    })();
  }, [productId]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      <Navbar />

      <div className="pt-28 pb-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          to="/products"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Products
        </Link>

        {loading ? (
          <div className="grid md:grid-cols-2 gap-12">
            <div className="aspect-square rounded-3xl bg-white border border-slate-100 animate-pulse" />
            <div className="space-y-4">
              <div className="h-6 w-32 bg-white border border-slate-100 rounded-full animate-pulse" />
              <div className="h-10 w-3/4 bg-white border border-slate-100 rounded-lg animate-pulse" />
              <div className="h-24 bg-white border border-slate-100 rounded-lg animate-pulse" />
            </div>
          </div>
        ) : error || !product ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
            <Package className="w-10 h-10" />
            <p className="text-sm font-medium">{error || 'Product not found.'}</p>
            <Link to="/products" className="text-sm font-semibold text-blue-600 hover:underline">
              Browse all products
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="aspect-square rounded-3xl overflow-hidden shadow-2xl border border-white bg-slate-50 flex items-center justify-center"
            >
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <ImageOff className="w-12 h-12 text-slate-300" />
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${
                  product.product_type === 'RENTAL' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {product.product_type === 'RENTAL' ? 'Rental' : 'For Sale'}
                </span>
                {product.category_name && (
                  <span className="text-xs font-medium text-slate-400">{product.category_name}</span>
                )}
              </div>

              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 leading-tight">
                {product.name}
              </h1>

              <p className="text-3xl font-bold text-slate-900 mb-6">
                {formatMoney(product.price)}
                {product.product_type === 'RENTAL' && (
                  <span className="text-sm font-medium text-slate-400"> /period</span>
                )}
              </p>

              <p className="text-slate-600 leading-relaxed mb-8 whitespace-pre-line">
                {product.description || 'No additional description has been provided for this product.'}
              </p>

              <div className="flex flex-wrap gap-4 mb-8">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" /> Verified by VCare
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Truck className="w-4 h-4 text-blue-500" /> Delivery arranged on request
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-6 py-6">
                <p className="text-sm font-semibold text-slate-800 mb-4">
                  To {product.product_type === 'RENTAL' ? 'rent' : 'buy'} this item, please contact our
                  administration team directly.
                </p>
                <div className="space-y-2.5">
                  <a
                    href="tel:+94773939112"
                    className="flex items-center gap-2.5 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
                  >
                    <Phone className="w-4 h-4 text-blue-600 shrink-0" /> +94 (77) 393 9112
                  </a>
                  <a
                    href="tel:+94767997796"
                    className="flex items-center gap-2.5 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
                  >
                    <Phone className="w-4 h-4 text-blue-600 shrink-0" /> +94 76 799 7796
                  </a>
                  <a
                    href="mailto:info@vcarenursing.com"
                    className="flex items-center gap-2.5 text-sm font-medium text-slate-700 hover:text-blue-600 transition-colors"
                  >
                    <Mail className="w-4 h-4 text-blue-600 shrink-0" /> info@vcarenursing.com
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default ProductDetailPage;
