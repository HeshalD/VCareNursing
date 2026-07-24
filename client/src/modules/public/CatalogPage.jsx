import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Package, ImageOff, ArrowRight, Search } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import apiClient from '../../api/api';

const money = new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 2 });
const formatMoney = (v) => money.format(Number(v || 0));

const ProductCard = ({ product, delay }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay, duration: 0.5 }}
  >
    <Link
      to={`/products/${product.product_id}`}
      className="group block bg-white rounded-2xl border border-slate-100 shadow-lg hover:border-blue-100 hover:shadow-xl transition-all overflow-hidden"
    >
      <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <ImageOff className="w-8 h-8 text-slate-300" />
        )}
      </div>
      <div className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
            product.product_type === 'RENTAL' ? 'bg-purple-50 text-purple-600' :
            product.product_type === 'ONE_TIME_SERVICE' ? 'bg-emerald-50 text-emerald-600' :
            'bg-blue-50 text-blue-600'
          }`}>
            {product.product_type === 'RENTAL' ? 'Rental' : product.product_type === 'ONE_TIME_SERVICE' ? 'Service' : 'For Sale'}
          </span>
          {product.category_name && (
            <span className="text-[11px] text-slate-400">{product.category_name}</span>
          )}
        </div>
        <h3 className="text-lg font-bold text-slate-900 mb-1.5 group-hover:text-blue-600 transition-colors">
          {product.name}
        </h3>
        <p className="text-sm text-slate-500 line-clamp-2 mb-4 leading-relaxed">
          {product.description || 'No description provided.'}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-slate-900">
            {formatMoney(product.price)}
            {product.product_type === 'RENTAL' && <span className="text-xs font-medium text-slate-400"> /period</span>}
          </span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600">
            Details <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </Link>
  </motion.div>
);

const CatalogPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'ITEM' | 'RENTAL' | 'ONE_TIME_SERVICE'

  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.getProducts();
        setProducts(Array.isArray(res?.data) ? res.data : []);
      } catch {
        setError('Failed to load products. Please try again later.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesType = typeFilter === 'ALL' || p.product_type === typeFilter;
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [products, search, typeFilter]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-40 pb-20 bg-white overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-50/60 via-white to-white" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-sm font-semibold mb-6"
          >
            <Package className="w-4 h-4 text-blue-600" /> Equipment & Rentals
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight tracking-tight"
          >
            Medical Equipment <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">& Care Essentials.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
            className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed"
          >
            Browse the equipment and rental items we make available to our clients — from mobility aids to
            transport support. Request an item and our team will follow up with a quotation.
          </motion.p>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-slate-100 bg-white sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2.5 rounded-full border border-slate-200 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div className="flex gap-1.5 rounded-full bg-slate-100 p-1">
            {[
              { id: 'ALL', label: 'All' },
              { id: 'ITEM', label: 'For Sale' },
              { id: 'RENTAL', label: 'Rentals' },
              { id: 'ONE_TIME_SERVICE', label: 'Services' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTypeFilter(id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  typeFilter === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Catalog Grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-80 rounded-2xl bg-white border border-slate-100 animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <p className="text-center text-slate-500 py-16">{error}</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
              <Package className="w-10 h-10" />
              <p className="text-sm font-medium">No products match your search right now.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {filtered.map((p, idx) => (
                <ProductCard key={p.product_id} product={p} delay={Math.min(idx * 0.05, 0.3)} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default CatalogPage;
