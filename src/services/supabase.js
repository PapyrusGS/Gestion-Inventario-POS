import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://uruveaadqbhvwtmnqwds.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVydXZlYWFkcWJodnd0bW5xd2RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQwODE2NjksImV4cCI6MjEwOTY1NzY2OX0.8WEGc9RIFCVtKmhyaIgqMCrha8IbnRgI6LMUqcOC5uQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Sube una imagen al bucket público 'product-images' en Supabase Storage
 * @param {File} file - Archivo de imagen seleccionado
 * @returns {Promise<string>} URL pública de la imagen
 */
export async function uploadProductImage(file) {
  if (!file) throw new Error('No se ha proporcionado ningún archivo');

  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
  const filePath = `products/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) {
    throw new Error(`Error al subir imagen a Supabase: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from('product-images')
    .getPublicUrl(filePath);

  return data.publicUrl;
}
