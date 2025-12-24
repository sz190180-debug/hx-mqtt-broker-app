import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { changeLanguage, getCurrentLanguage, getSupportedLanguages, t } from '@/utils/i18n';

interface LanguageSwitcherProps {
  onLanguageChange?: () => void;
}

export function LanguageSwitcher({ onLanguageChange }: LanguageSwitcherProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState(getCurrentLanguage());
  const supportedLanguages = getSupportedLanguages();

  const handleLanguageChange = async (languageCode: string) => {
    try {
      await changeLanguage(languageCode);
      setCurrentLanguage(languageCode);
      setModalVisible(false);
      onLanguageChange?.();
    } catch (error) {
      console.warn('Failed to change language:', error);
    }
  };

  const getCurrentLanguageName = () => {
    const language = supportedLanguages.find(lang => lang.code === currentLanguage);
    return language?.name || 'Unknown';
  };

  const renderLanguageItem = ({ item }: { item: { code: string; name: string } }) => (
    <TouchableOpacity
      style={[
        styles.languageItem,
        item.code === currentLanguage && styles.selectedLanguageItem
      ]}
      onPress={() => handleLanguageChange(item.code)}
    >
      <Text style={[
        styles.languageText,
        item.code === currentLanguage && styles.selectedLanguageText
      ]}>
        {item.name}
      </Text>
      {item.code === currentLanguage && (
        <Ionicons name="checkmark" size={20} color="#3b82f6" />
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="language" size={20} color="#666" />
        <Text style={styles.triggerText}>{getCurrentLanguageName()}</Text>
        <Ionicons name="chevron-down" size={16} color="#666" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择语言 / Select Language</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={supportedLanguages}
              renderItem={renderLanguageItem}
              keyExtractor={(item) => item.code}
              style={styles.languageList}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  triggerText: {
    marginLeft: 8,
    marginRight: 4,
    fontSize: 14,
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  languageList: {
    maxHeight: 200,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedLanguageItem: {
    backgroundColor: '#e3f2fd',
  },
  languageText: {
    fontSize: 16,
    color: '#333',
  },
  selectedLanguageText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});
