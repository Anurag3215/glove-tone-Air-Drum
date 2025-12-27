"""
VIOLIN STROKE TRAINING - Dual Model (Peak + Full)
Trains both 80ms peak model and 120ms full model for violin
Based on gz (gyro-Z) axis for bow direction
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
# CONFIGURATION
# ============================================================================
DATASET_PATH = r"D:\Main project\violin\dataset"  # Change to your violin dataset path
MODEL_PATH = r"D:\Main project\violin\models"
SAMPLE_RATE = 200

# Violin bows are slower/longer than guitar strokes
PEAK_WINDOW_MS = 80   # Peak-centered for main detection
FULL_WINDOW_MS = 120  # Full context for verification
LOWPASS_CUTOFF = 30

os.makedirs(MODEL_PATH, exist_ok=True)

# ============================================================================
# VIOLIN PREPROCESSOR (gz-based)
# ============================================================================

class ViolinPreprocessor:
    """
    Extracts peak and full windows from violin bow strokes
    Uses ALL IMU axes (ax, ay, az, gx, gy, gz) - not just gz!
    Lets the model learn which axes are discriminative
    """
    
    def __init__(self, sample_rate=200, lowpass_cutoff=30):
        self.sample_rate = sample_rate
        self.lowpass_cutoff = lowpass_cutoff
        
        # Separate scalers for peak and full models
        self.peak_scaler = StandardScaler()
        self.full_scaler = StandardScaler()
        
        # Filter
        nyquist = sample_rate / 2
        normalized_cutoff = lowpass_cutoff / nyquist
        self.b, self.a = signal.butter(4, normalized_cutoff, btype='low')
    
    def load_all_strokes(self, path):
        """Load violin dataset - each CSV is one bow stroke"""
        print("\n" + "="*60)
        print("LOADING VIOLIN STROKE DATASET")
        print("="*60)
        
        csv_files = glob.glob(os.path.join(path, "*.csv"))
        print(f"Found {len(csv_files)} bow stroke files")
        
        peak_windows = []
        full_windows = []
        all_labels = []
        
        for csv_file in csv_files:
            try:
                df = pd.read_csv(csv_file)
                label = df['label'].iloc[0]  # 'up' or 'down'
                
                # Extract both window types from each stroke
                peak_win = self.extract_peak_window(df)
                full_win = self.extract_full_window(df)
                
                if peak_win is not None and full_win is not None:
                    peak_windows.append(peak_win)
                    full_windows.append(full_win)
                    all_labels.append(1 if label == 'up' else 0)
                    
                    if len(peak_windows) % 50 == 0:
                        print(f"  Processed {len(peak_windows)} strokes...")
                    
            except Exception as e:
                print(f"⚠ Error processing {csv_file}: {e}")
        
        print(f"\n✓ Created violin dataset:")
        print(f"  Peak windows (80ms): {len(peak_windows)}")
        print(f"  Full windows (120ms): {len(full_windows)}")
        print(f"  Down-bow: {sum(np.array(all_labels)==0)}, Up-bow: {sum(np.array(all_labels)==1)}")
        
        return (peak_windows, full_windows), np.array(all_labels)
    
    def extract_peak_window(self, df):
        """
        Peak-centered 80ms window for main detection
        Focuses on gz peak (your observation: up-bow has large gz spike)
        """
        if len(df) < 10:
            return None
        
        # Get IMU data
        imu_data = df[['ax', 'ay', 'az', 'gx', 'gy', 'gz']].values
        
        # Apply filter
        imu_filtered = np.apply_along_axis(
            lambda x: signal.filtfilt(self.b, self.a, x), 
            axis=0, 
            arr=imu_data
        )
        
        # Find peak using gyro magnitude (gz is primary, but use total for robustness)
        gyro_magnitude = np.sqrt(imu_filtered[:, 3]**2 + imu_filtered[:, 4]**2 + imu_filtered[:, 5]**2)
        peak_idx = np.argmax(gyro_magnitude)
        
        # Create 80ms window centered around peak
        window_samples = int(PEAK_WINDOW_MS * self.sample_rate / 1000)  # 16 samples
        half_window = window_samples // 2
        
        start_idx = max(0, peak_idx - half_window)
        end_idx = min(len(imu_filtered), start_idx + window_samples)
        
        # Adjust if at boundaries
        if end_idx - start_idx < window_samples:
            if start_idx == 0:
                end_idx = min(window_samples, len(imu_filtered))
            else:
                start_idx = max(0, len(imu_filtered) - window_samples)
                end_idx = len(imu_filtered)
        
        window = imu_filtered[start_idx:end_idx]
        
        # Pad if necessary
        if len(window) < window_samples:
            padding = np.zeros((window_samples - len(window), 6))
            window = np.vstack([window, padding])
        
        return window
    
    def extract_full_window(self, df):
        """
        Full 120ms window for verification
        Captures complete bow stroke context
        """
        if len(df) < 5:
            return None
        
        imu_data = df[['ax', 'ay', 'az', 'gx', 'gy', 'gz']].values
        
        imu_filtered = np.apply_along_axis(
            lambda x: signal.filtfilt(self.b, self.a, x), 
            axis=0, 
            arr=imu_data
        )
        
        # Take entire stroke (up to 120ms)
        max_samples = int(FULL_WINDOW_MS * self.sample_rate / 1000)  # 24 samples
        
        if len(imu_filtered) > max_samples:
            window = imu_filtered[:max_samples]
        else:
            window = imu_filtered
        
        # Pad to 24 samples
        if len(window) < max_samples:
            padding = np.zeros((max_samples - len(window), 6))
            window = np.vstack([window, padding])
        
        return window
    
    def preprocess_datasets(self):
        """Preprocess both peak and full datasets"""
        print("\n" + "="*60)
        print("PREPROCESSING VIOLIN DATASETS")
        print("="*60)
        
        # Load both window types
        (peak_windows, full_windows), y = self.load_all_strokes(DATASET_PATH)
        
        # Convert to numpy
        X_peak = np.array(peak_windows)
        X_full = np.array(full_windows)
        
        print(f"\nWindow shapes:")
        print(f"  Peak:  {X_peak.shape}")  # (n, 16, 6)
        print(f"  Full:  {X_full.shape}")  # (n, 24, 6)
        
        # Normalize separately
        print("\nNormalizing peak detection data...")
        X_peak_flat = X_peak.reshape(-1, X_peak.shape[-1])
        X_peak_norm = self.peak_scaler.fit_transform(X_peak_flat)
        X_peak = X_peak_norm.reshape(X_peak.shape)
        
        print("Normalizing full context data...")
        X_full_flat = X_full.reshape(-1, X_full.shape[-1])
        X_full_norm = self.full_scaler.fit_transform(X_full_flat)
        X_full = X_full_norm.reshape(X_full.shape)
        
        print("✓ All datasets normalized")
        
        return (X_peak, X_full), y

# ============================================================================
# MODEL ARCHITECTURES
# ============================================================================

def build_peak_model(input_shape):
    """Peak detection model (80ms) - Main workhorse"""
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

def build_full_model(input_shape):
    """Full context model (120ms) - Verification & stats"""
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
# TRAINING
# ============================================================================

def train_model(X, y, model_name, model_builder):
    """Train and evaluate a model"""
    print(f"\n" + "="*60)
    print(f"TRAINING {model_name.upper()} MODEL")
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
    print("\nTraining...")
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
    
    print(f"\n🎻 {model_name.upper()} RESULTS:")
    print(f"  Overall Accuracy: {test_acc*100:.2f}%")
    print(f"  Down-bow Accuracy: {down_acc*100:.2f}%")
    print(f"  Up-bow Accuracy: {up_acc*100:.2f}%")
    
    # Confidence analysis
    down_confidences = y_pred[down_mask, 0] if sum(down_mask) > 0 else []
    up_confidences = y_pred[up_mask, 1] if sum(up_mask) > 0 else []
    
    if len(down_confidences) > 0:
        print(f"  Average Confidence - Down: {np.mean(down_confidences):.3f}")
    if len(up_confidences) > 0:
        print(f"  Average Confidence - Up: {np.mean(up_confidences):.3f}")
    
    return model, history, test_acc

# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    print("\n" + "="*60)
    print("🎻 VIOLIN BOW STROKE TRAINING - DUAL MODEL")
    print("="*60)
    print("Training strategy:")
    print("  • Peak Model (80ms) - Main detection & correction")
    print("  • Full Model (120ms) - Verification & statistics")
    print("\nBased on gz (gyro-Z) axis observation:")
    print("  • Down-bow: small positive gz")
    print("  • Up-bow: large positive gz + negative dip")
    print("="*60)
    
    # Preprocess
    preprocessor = ViolinPreprocessor(SAMPLE_RATE)
    (X_peak, X_full), y = preprocessor.preprocess_datasets()
    
    # Train Peak Model (main detection)
    peak_model, peak_history, peak_acc = train_model(
        X_peak, y, "peak (80ms)", build_peak_model
    )
    
    # Save peak model
    peak_model.save(os.path.join(MODEL_PATH, 'peak_centered_model.keras'), save_format='keras_v3')
    peak_model.save(os.path.join(MODEL_PATH, 'peak_centered_model.h5'), save_format='h5')
    peak_model.save_weights(os.path.join(MODEL_PATH, 'peak_centered_model_weights.h5'))
    try:
    # Convert peak model directly to TFLite (no save/load!)
        print("Converting peak_model to TFLite...")
        converter = tf.lite.TFLiteConverter.from_keras_model(peak_model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        tflite_model = converter.convert()
    
        with open(os.path.join(MODEL_PATH, 'peak_centered_model.tflite'), 'wb') as f:
            f.write(tflite_model)
    
        print("✓ peak_centered_model.tflite created!")
    
    except Exception as e:
        print(f"TFLite conversion error: {e}")
    
    joblib.dump(preprocessor.peak_scaler, os.path.join(MODEL_PATH, 'peak_centered_scaler.pkl'))
    print(f"\n✓ Peak model saved: peak_centered_model.keras")
    
    # Train Full Model (verification)
    full_model, full_history, full_acc = train_model(
        X_full, y, "full (120ms)", build_full_model
    )
    
    # Save full model
    full_model.save(os.path.join(MODEL_PATH, 'full_model.keras'), save_format='keras_v3')
    full_model.save(os.path.join(MODEL_PATH, 'full_model.h5'), save_format='h5')
    full_model.save_weights(os.path.join(MODEL_PATH, 'full_model_weights.h5'))
    try:
    # Convert peak model directly to TFLite (no save/load!)
        print("Converting peak_model to TFLite...")
        converter = tf.lite.TFLiteConverter.from_keras_model(full_model)
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        tflite_model = converter.convert()
    
        with open(os.path.join(MODEL_PATH, 'full_centered_model.tflite'), 'wb') as f:
            f.write(tflite_model)
    
        print("✓ full_centered_model.tflite created!")
    
    except Exception as e:
        print(f"TFLite conversion error: {e}")
    
    joblib.dump(preprocessor.full_scaler, os.path.join(MODEL_PATH, 'full_scaler.pkl'))
    print(f"✓ Full model saved: full_model.keras")
    
    # Final comparison
    print("\n" + "="*60)
    print("🏆 MODEL COMPARISON")
    print("="*60)
    print(f"  Peak Model (80ms):  {peak_acc*100:.2f}%")
    print(f"  Full Model (120ms): {full_acc*100:.2f}%")
    print("\n✓ Both models trained and saved!")
    print("\nNext: Use violin_detector.py for inference")
    print("="*60 + "\n")