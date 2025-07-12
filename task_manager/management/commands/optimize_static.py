import os
import re
from django.core.management.base import BaseCommand
from django.conf import settings
from django.contrib.staticfiles.finders import find


class Command(BaseCommand):
    help = 'Optimize static files by minifying CSS and JS'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force regeneration of minified files',
        )

    def handle(self, *args, **options):
        self.stdout.write('Starting static file optimization...')
        
        # Find all CSS files
        css_files = []
        for finder in settings.STATICFILES_FINDERS:
            if hasattr(finder, 'find'):
                for path in finder.find('css'):
                    if path.endswith('.css') and not path.endswith('.min.css'):
                        css_files.append(path)
        
        # Find all JS files
        js_files = []
        for finder in settings.STATICFILES_FINDERS:
            if hasattr(finder, 'find'):
                for path in finder.find('js'):
                    if path.endswith('.js') and not path.endswith('.min.js'):
                        js_files.append(path)
        
        # Process CSS files
        for css_file in css_files:
            self.minify_css(css_file, options['force'])
        
        # Process JS files
        for js_file in js_files:
            self.minify_js(js_file, options['force'])
        
        self.stdout.write(
            self.style.SUCCESS('Static file optimization completed!')
        )

    def minify_css(self, file_path, force=False):
        """Minify CSS file"""
        min_path = file_path.replace('.css', '.min.css')
        
        if os.path.exists(min_path) and not force:
            self.stdout.write(f'Skipping {file_path} (minified version exists)')
            return
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Basic CSS minification
            minified = self._minify_css_content(content)
            
            with open(min_path, 'w', encoding='utf-8') as f:
                f.write(minified)
            
            original_size = len(content)
            minified_size = len(minified)
            reduction = ((original_size - minified_size) / original_size) * 100
            
            self.stdout.write(
                f'Minified {file_path} -> {min_path} '
                f'({reduction:.1f}% reduction)'
            )
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error minifying {file_path}: {e}')
            )

    def minify_js(self, file_path, force=False):
        """Minify JS file"""
        min_path = file_path.replace('.js', '.min.js')
        
        if os.path.exists(min_path) and not force:
            self.stdout.write(f'Skipping {file_path} (minified version exists)')
            return
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Basic JS minification
            minified = self._minify_js_content(content)
            
            with open(min_path, 'w', encoding='utf-8') as f:
                f.write(minified)
            
            original_size = len(content)
            minified_size = len(minified)
            reduction = ((original_size - minified_size) / original_size) * 100
            
            self.stdout.write(
                f'Minified {file_path} -> {min_path} '
                f'({reduction:.1f}% reduction)'
            )
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error minifying {file_path}: {e}')
            )

    def _minify_css_content(self, content):
        """Basic CSS minification"""
        # Remove comments
        content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        
        # Remove unnecessary whitespace
        content = re.sub(r'\s+', ' ', content)
        content = re.sub(r';\s*}', '}', content)
        content = re.sub(r'{\s*', '{', content)
        content = re.sub(r'}\s*', '}', content)
        content = re.sub(r':\s*', ':', content)
        content = re.sub(r';\s*', ';', content)
        content = re.sub(r',\s*', ',', content)
        
        # Remove trailing semicolons before closing braces
        content = re.sub(r';+}', '}', content)
        
        return content.strip()

    def _minify_js_content(self, content):
        """Basic JS minification"""
        # Remove single-line comments (but preserve URLs)
        content = re.sub(r'(?<!:)//.*$', '', content, flags=re.MULTILINE)
        
        # Remove multi-line comments
        content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        
        # Remove unnecessary whitespace
        content = re.sub(r'\s+', ' ', content)
        content = re.sub(r';\s*}', '}', content)
        content = re.sub(r'{\s*', '{', content)
        content = re.sub(r'}\s*', '}', content)
        content = re.sub(r'\(\s*', '(', content)
        content = re.sub(r'\s*\)', ')', content)
        content = re.sub(r'\[\s*', '[', content)
        content = re.sub(r'\s*\]', ']', content)
        
        return content.strip()