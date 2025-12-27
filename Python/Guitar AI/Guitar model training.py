"""
ULTIMATE STROKE DETECTION TRAINING
Trains multiple models for different detection strategies
"""

import numpy as np
import pandas as pd
import os
import glob
from scipy import signal
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import joblib
import sys

sys.setrecursionlimit(10000)

# ============================================================================
# CONFIGURATION - MULTI-MODEL TRAINING
# ============================================================================
DATASET_PATH = r"D:\Main project\guitar\dataset"
MODEL_PATH = r"D:\Main project\guitar\models"
SAMPLE_RATE = 200

# DIFFERENT WINDOW STRATEGIES
EARLY_WINDOW_MS = 40    # First 40ms for early detection  
PEAK_WINDOW_MS = 80     # Peak-centered for confirmation
FULL_WINDOW_MS = 120    # Full stroke for maximum context

os.makedirs(MODEL_PATH, exist_ok=True)

# ============================================================================
# MULTI-STRATEGY PREPROCESSOR
# ============================================================================

class MultiStrategyPreprocessor:
    """Extracts multiple window types from each stroke"""
    
    def __init__(self, sample_rate=200, lowpass_cutoff=30):
        self.sample_rate = sample_rate
        self.lowpass_cutoff = lowpass_cutoff
        
        # Create separate scalers for each strategy
        self.early_scaler = StandardScaler()
        self.peak_scaler = StandardScaler() 
        self.full_scaler = StandardScaler()
        
        # Filter
        nyquist = sample_rate / 2
        normalized_cutoff = lowpass_cutoff / nyquist
        self.b, self.a = signal.butter(4, normalized_cutoff, btype='low')
    
    def load_all_strokes(self, path):
        """Load dataset and extract multiple window types"""
        print("\n" + "="*60)
        print("LOADING MULTI-STRATEGY DATASET")
        print("="*60)
        
        csv_files = glob.glob(os.path.join(path, "*.csv"))
        print(f"Found {len(csv_files)} stroke files")
        
        # Store windows for each strategy
        early_windows = []
        peak_windows = []
        full_windows = []
        all_labels = []
        
        for csv_file in csv_files:
            try:
                df = pd.read_csv(csv_file)
                label = df['label'].iloc[0]
                
                # Extract THREE different windows from each stroke
                early_win = self.extract_early_window(df)
                peak_win = self.extract_peak_window(df) 
                full_win = self.extract_full_window(df)
                
                if early_win is not None and peak_win is not None and full_win is not None:
                    early_windows.append(early_win)
                    peak_windows.append(peak_win)
                    full_windows.append(full_win)
                    all_labels.append(1 if label == 'up' else 0)
                    
                    if len(early_windows) % 50 == 0:
                        print(f"  Processed {len(early_windows)} strokes...")
                    
            except Exception as e:
                print(f"⚠ Error processing {csv_file}: {e}")
        
        print(f"\n✓ Created multi-strategy dataset:")
        print(f"  Early windows (40ms): {len(early_windows)}")
        print(f"  Peak windows (80ms): {len(peak_windows)}") 
        print(f"  Full windows (120ms): {len(full_windows)}")
        print(f"  Down: {sum(np.array(all_labels)==0)}, Up: {sum(np.array(all_labels)==1)}")
        
        return (early_windows, peak_windows, full_windows), np.array(all_labels)
    
    def extract_early_window(self, df):
        """First 40ms - for LOW LATENCY detection"""
        if len(df) < 5:
            return None
        
        imu_data = df[['ax', 'ay', 'az', 'gx', 'gy', 'gz']].values
        imu_filtered = np.apply_along_axis(
            lambda x: signal.filtfilt(self.b, self.a, x), axis=0, arr=imu_data
        )
        
        # Take FIRST 40ms (8 samples)
        window_samples = int(EARLY_WINDOW_MS * self.sample_rate / 1000)
        if len(imu_filtered) < window_samples:
            padding = np.zeros((window_samples - len(imu_filtered), 6))
            window = np.vstack([imu_filtered, padding])
        else:
            window = imu_filtered[:window_samples]
        
        return window
    
    def extract_peak_window(self, df):
        """Peak-centered 80ms - for HIGH CONFIDENCE"""
        if len(df) < 10:
            return None
        
        imu_data = df[['ax', 'ay', 'az', 'gx', 'gy', 'gz']].values
        imu_filtered = np.apply_along_axis(
            lambda x: signal.filtfilt(self.b, self.a, x), axis=0, arr=imu_data
        )
        
        # Find peak and center window
        gyro_magnitude = np.sqrt(imu_filtered[:, 3]**2 + imu_filtered[:, 4]**2 + imu_filtered[:, 5]**2)
        peak_idx = np.argmax(gyro_magnitude)
        
        window_samples = int(PEAK_WINDOW_MS * self.sample_rate / 1000)
        half_window = window_samples // 2
        
        start_idx = max(0, peak_idx - half_window)
        end_idx = min(len(imu_filtered), start_idx + window_samples)
        
        if end_idx - start_idx < window_samples:
            if start_idx == 0:
                end_idx = window_samples
            else:
                start_idx = len(imu_filtered) - window_samples
        
        window = imu_filtered[start_idx:end_idx]
        
        if len(window) < window_samples:
            padding = np.zeros((window_samples - len(window), 6))
            window = np.vstack([window, padding])
        
        return window
    
    def extract_full_window(self, df):
        """Full stroke context - for MAXIMUM ACCURACY"""
        if len(df) < 5:
            return None
        
        imu_data = df[['ax', 'ay', 'az', 'gx', 'gy', 'gz']].values
        imu_filtered = np.apply_along_axis(
            lambda x: signal.filtfilt(self.b, self.a, x), axis=0, arr=imu_data
        )
        
        # Take entire stroke (up to 120ms)
        max_samples = int(FULL_WINDOW_MS * self.sample_rate / 1000)
        
        if len(imu_filtered) > max_samples:
            window = imu_filtered[:max_samples]
        else:
            window = imu_filtered
        
        # Pad to consistent size
        if len(window) < max_samples:
            padding = np.zeros((max_samples - len(window), 6))
            window = np.vstack([window, padding])
        
        return window
    
    def preprocess_datasets(self):
        """Preprocess all three strategies"""
        print("\n" + "="*60)
        print("PREPROCESSING MULTI-STRATEGY DATASETS")
        print("="*60)
        
        # Load all window types
        (early_windows, peak_windows, full_windows), y = self.load_all_strokes(DATASET_PATH)
        
        # Convert to numpy
        X_early = np.array(early_windows)
        X_peak = np.array(peak_windows) 
        X_full = np.array(full_windows)
        
        print(f"\nWindow shapes:")
        print(f"  Early: {X_early.shape}")  # (n, 8, 6)
        print(f"  Peak:  {X_peak.shape}")   # (n, 16, 6)
        print(f"  Full:  {X_full.shape}")   # (n, 24, 6)
        
        # Normalize each dataset separately
        print("\nNormalizing early detection data...")
        X_early_flat = X_early.reshape(-1, X_early.shape[-1])
        X_early_norm = self.early_scaler.fit_transform(X_early_flat)
        X_early = X_early_norm.reshape(X_early.shape)
        
        print("Normalizing peak detection data...")
        X_peak_flat = X_peak.reshape(-1, X_peak.shape[-1])
        X_peak_norm = self.peak_scaler.fit_transform(X_peak_flat)
        X_peak = X_peak_norm.reshape(X_peak.shape)
        
        print("Normalizing full context data...")
        X_full_flat = X_full.reshape(-1, X_full.shape[-1])
        X_full_norm = self.full_scaler.fit_transform(X_full_flat)
        X_full = X_full_norm.reshape(X_full.shape)
        
        print("✓ All datasets normalized")
        
        return (X_early, X_peak, X_full), y

# ============================================================================
# SPECIALIZED MODELS FOR EACH STRATEGY
# ============================================================================

def build_early_detection_model(input_shape):
    """FAST model for early detection - optimized for speed"""
    model = keras.Sequential([
        layers.Input(shape=input_shape),
        
        # Shallow network for speed
        layers.Conv1D(16, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        
        layers.Conv1D(32, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        
        layers.GlobalAveragePooling1D(),
        
        layers.Dense(16, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(2, activation='softmax')
    ])
    
    return model

def build_peak_detection_model(input_shape):
    """BALANCED model for peak detection - our current workhorse"""
    model = keras.Sequential([
        layers.Input(shape=input_shape),
        
        layers.Conv1D(32, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        
        layers.Conv1D(64, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        
        layers.GlobalAveragePooling1D(),
        
        layers.Dense(32, activation='relu'),
        layers.Dropout(0.3),
        layers.Dense(16, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(2, activation='softmax')
    ])
    
    return model

def build_full_context_model(input_shape):
    """POWERFUL model for full context - maximum accuracy"""
    model = keras.Sequential([
        layers.Input(shape=input_shape),
        
        layers.Conv1D(64, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        
        layers.Conv1D(128, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        
        layers.Conv1D(256, kernel_size=3, activation='relu', padding='same'),
        layers.BatchNormalization(),
        layers.MaxPooling1D(2),
        
        layers.GlobalAveragePooling1D(),
        
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.4),
        layers.Dense(32, activation='relu'),
        layers.Dropout(0.3),
        layers.Dense(2, activation='softmax')
    ])
    
    return model

# ============================================================================
# ENHANCED TRAINING WITH STRATEGY COMPARISON
# ============================================================================

def train_strategy_model(X, y, strategy_name, model_builder):
    """Train and evaluate a specific strategy"""
    print(f"\n" + "="*60)
    print(f"TRAINING {strategy_name.upper()} MODEL")
    print("="*60)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, stratify=y, random_state=42, shuffle=True
    )
    
    print(f"Dataset: {X_train.shape[0]} train, {X_test.shape[0]} test")
    print(f"Train - Down: {sum(y_train==0)}, Up: {sum(y_train==1)}")
    print(f"Test - Down: {sum(y_test==0)}, Up: {sum(y_test==1)}")
    
    # Build model
    input_shape = (X.shape[1], X.shape[2])
    model = model_builder(input_shape)
    
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    model.summary()
    
    # Callbacks
    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor='val_accuracy',
            patience=15,
            restore_best_weights=True,
            mode='max'
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor='val_accuracy',
            factor=0.5,
            patience=8,
            min_lr=1e-7,
            mode='max'
        )
    ]
    
    # Convert to categorical
    y_train_cat = keras.utils.to_categorical(y_train, num_classes=2)
    y_test_cat = keras.utils.to_categorical(y_test, num_classes=2)
    
    # Train
    history = model.fit(
        X_train, y_train_cat,
        validation_data=(X_test, y_test_cat),
        epochs=100,
        batch_size=32,
        callbacks=callbacks,
        verbose=1,
        shuffle=True
    )
    
    # Evaluate
    test_loss, test_acc = model.evaluate(X_test, y_test_cat, verbose=0)
    
    # Per-class accuracy
    y_pred = model.predict(X_test, verbose=0)
    y_pred_classes = np.argmax(y_pred, axis=1)
    
    down_mask = y_test == 0
    up_mask = y_test == 1
    
    down_acc = np.mean(y_pred_classes[down_mask] == 0) if sum(down_mask) > 0 else 0
    up_acc = np.mean(y_pred_classes[up_mask] == 1) if sum(up_mask) > 0 else 0
    
    print(f"\n🎯 {strategy_name.upper()} RESULTS:")
    print(f"  Overall Accuracy: {test_acc*100:.2f}%")
    print(f"  Downstroke Accuracy: {down_acc*100:.2f}%")
    print(f"  Upstroke Accuracy: {up_acc*100:.2f}%")
    
    return model, history, test_acc

# ============================================================================
# MAIN - TRAIN ALL STRATEGIES
# ============================================================================

if __name__ == "__main__":
    print("\n" + "="*60)
    print("ULTIMATE STROKE DETECTION TRAINING")
    print("Training 3 specialized models:")
    print("  1. EARLY (40ms) - Low latency")
    print("  2. PEAK (80ms) - Balanced")  
    print("  3. FULL (120ms) - Maximum accuracy")
    print("="*60)
    
    # Preprocess all strategies
    preprocessor = MultiStrategyPreprocessor(SAMPLE_RATE)
    (X_early, X_peak, X_full), y = preprocessor.preprocess_datasets()
    
    # Train all models
    results = {}
    
    # 1. Early detection model
    early_model, early_history, early_acc = train_strategy_model(
        X_early, y, "early detection", build_early_detection_model
    )
    results['early'] = early_acc
    
    # Save early model
    early_model.save(os.path.join(MODEL_PATH, 'early_model.keras'))
    joblib.dump(preprocessor.early_scaler, os.path.join(MODEL_PATH, 'early_scaler.pkl'))
    
    # 2. Peak detection model  
    peak_model, peak_history, peak_acc = train_strategy_model(
        X_peak, y, "peak detection", build_peak_detection_model
    )
    results['peak'] = peak_acc
    
    # Save peak model
    peak_model.save(os.path.join(MODEL_PATH, 'peak_model.h5'), save_format='h5')
    peak_model.save(os.path.join(MODEL_PATH, 'peak_model_v3.keras'), save_format='keras_v3')
    peak_model.save_weights(os.path.join(MODEL_PATH, 'peak_model_weights.h5'))
    joblib.dump(preprocessor.peak_scaler, os.path.join(MODEL_PATH, 'peak_scaler.pkl'))
    print("✓ Peak model saved in multiple formats")
    try:
    # Convert peak model directly to TFLite (no save/load!)
        print("Converting peak_model to TFLite...")
        converter = tf.lite.TFLiteConverter.from_keras_model(peak_model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        tflite_model = converter.convert()
    
        with open(os.path.join(MODEL_PATH, 'peak_model.tflite'), 'wb') as f:
            f.write(tflite_model)
    
        print("✓ peak_model.tflite created!")
    
    except Exception as e:
        print(f"TFLite conversion error: {e}")
    # 3. Full context model
    full_model, full_history, full_acc = train_strategy_model(
        X_full, y, "full context", build_full_context_model
    )
    results['full'] = full_acc
    
    # Save full model
    full_model.save(os.path.join(MODEL_PATH, 'full_model_v3.keras'), save_format='keras_v3')
    full_model.save_weights(os.path.join(MODEL_PATH, 'full_model_weights.h5'))
    full_model.save(os.path.join(MODEL_PATH, 'full_model.h5'), save_format='h5')
    joblib.dump(preprocessor.full_scaler, os.path.join(MODEL_PATH, 'full_scaler.pkl'))
    
    try:
    # Convert peak model directly to TFLite (no save/load!)
        print("Converting peak_model to TFLite...")
        converter = tf.lite.TFLiteConverter.from_keras_model(full_model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        tflite_model = converter.convert()
    
        with open(os.path.join(MODEL_PATH, 'full_model.tflite'), 'wb') as f:
            f.write(tflite_model)
    
        print("✓ full_model.tflite created!")
    
    except Exception as e:
        print(f"TFLite conversion error: {e}")
    
    # Final comparison
    print("\n" + "="*60)
    print("🏆 STRATEGY COMPARISON")
    print("="*60)
    for strategy, accuracy in results.items():
        print(f"  {strategy.upper():<12}: {accuracy*100:.2f}%")
    
    print("\n✓ All models saved!")
    print("Next: Use the ULTIMATE inference script with all three models!")
    print("="*60 + "\n")